import { sb } from './supabase.js';
import { TURNSTILE_SITE_KEY } from './config.js';
import { h } from './dom.js';
import { icon, iconLink, deleteButton, dataTable, pill } from './ui.js';
import { COLUMNS, dateCell, fallbackColumns } from './columns.js';
import { buildForm } from './forms.js';
import { buildRow } from './rules.js';
import { loadLookups, resolveOptions } from './lookups.js';
import { SECTIONS, PROFILE_FIELDS, HOME_GROUPS } from './sections.js';
import { applyFilters, facetValues, yearsIn, isFiltered } from './filters.js';
import { viewSummaries, viewSummaryEditor } from './summaries.js';
import { viewReports, viewReportBuilder } from './reports.js';
import { viewImport } from './import-view.js';
import { viewWebsite } from './website.js';
import { viewTeam } from './team.js';

const root = document.getElementById('app');
const state = { session: null, profile: null, isOwner: false, flash: null, filters: {} };

/* ---------- helpers ---------- */
const go = (hash) => { location.hash = hash; };
function friendly(error) {
  const m = (error && error.message) || String(error);
  if (/invalid login credentials/i.test(m)) return 'Email or password is wrong.';
  if (/failed to fetch|networkerror|load failed/i.test(m)) return 'No connection. Check your internet and try again.';
  if (/captcha/i.test(m)) return 'The captcha check failed. Reload the page and try again.';
  if (/row-level security|permission denied/i.test(m)) return 'The database refused this action. Sign out, sign in again, and retry.';
  if (/end_not_before_start/i.test(m)) return 'End date cannot be before the start date.';
  return m;
}
function setFlash(kind, text) { state.flash = { kind, text }; }

function takeFlash() { const f = state.flash; state.flash = null; return f ? h('div', { class: `flash ${f.kind}`, role: 'status' }, f.text) : null; }
function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = on ? 'Working…' : label; }

async function loadProfile() {
  const uid = state.session.user.id;
  const { data, error } = await sb.from('profiles').select('*').eq('user_id', uid).maybeSingle();
  if (error) throw error;
  state.profile = data;
  // Only the site owner sees the website fields. Everyone else gets the plain forms.
  const own = await sb.rpc('is_site_owner');
  state.isOwner = !own.error && own.data === true;
  return data;
}

/* ---------- shell ---------- */
function shell(title, ...content) { return render(title, true, content); }
function loadingShell(title) { return render(title, false, [h('p', {}, 'Loading…')]); }
// `title` is a string, or { title, eyebrow, sub, action: { href, label } } for the large page heading in the dark band.
function render(title, withFlash, content) {
  const hero = typeof title === 'object' && title ? title : { title };
  const hash = location.hash || '#/';
  const at = (...starts) => starts.some((x) => hash === x || hash.startsWith(`${x}/`));
  const onProfile = at('#/profile', '#/import', '#/website');
  const onReports = at('#/reports', '#/report');
  const link = (href, label, on) => h('a', { class: `nav-link${on ? ' on' : ''}`, href, 'aria-current': on ? 'page' : false }, label);
  const nav = state.session ? h('nav', { class: 'main-nav', 'aria-label': 'Main' },
    link('#/', 'Home', !onProfile && !onReports),
    link('#/reports', 'Reports', onReports),
    profileMenu(onProfile)) : null;
  const heading = hero.title ? h('div', { class: 'hero' },
    h('div', {},
      hero.eyebrow ? h('p', { class: 'eyebrow' }, hero.eyebrow) : null,
      h('h1', {}, hero.title),
      hero.sub ? h('p', { class: 'hero-sub' }, hero.sub) : null),
    hero.action ? h('a', { class: 'btn light', href: hero.action.href }, icon('plus', 16), hero.action.label) : null) : null;
  root.replaceChildren(
    h('header', { class: 'band' }, h('div', { class: 'band-in' },
      h('div', { class: 'top' }, h('a', { class: 'brand', href: '#/' }, 'Scientist Profile'), nav), heading)),
    h('main', {}, withFlash ? takeFlash() : null, ...content));
}

// The Profile drop-down. One document-level listener serves every render, so menus never pile up listeners.
let closeMenu = null;
document.addEventListener('click', (ev) => { if (closeMenu && !ev.target.closest('.pm')) closeMenu(); });
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && closeMenu) closeMenu(); });
function profileMenu(active) {
  const btn = h('button', { type: 'button', class: `pm-btn${active ? ' on' : ''}`, 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'pm-list' },
    'Profile', icon('chevron', 16));
  const item = (href, label) => h('a', { role: 'menuitem', href }, label);
  const list = h('div', { id: 'pm-list', class: 'pm-list', role: 'menu', hidden: true },
    item('#/profile', 'My profile details'),
    item('#/import', 'Bulk upload'),
    state.isOwner ? item('#/website', 'SM Website edit') : null,
    h('hr'),
    h('button', { type: 'button', role: 'menuitem', class: 'out', onclick: async () => { await sb.auth.signOut(); } }, 'Sign out'));
  const wrap = h('div', { class: 'pm' }, btn, list);
  const close = () => { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (closeMenu === close) closeMenu = null; };
  btn.addEventListener('click', () => {
    if (!list.hidden) return close();
    if (closeMenu) closeMenu();
    list.hidden = false; btn.setAttribute('aria-expanded', 'true'); closeMenu = close;
    const first = list.querySelector('a'); if (first) first.focus();
  });
  list.addEventListener('click', (ev) => { if (ev.target.closest('a')) close(); });
  return wrap;
}

/* ---------- login ---------- */
function viewLogin() {
  let token = null;
  const email = h('input', { id: 'email', type: 'email', autocomplete: 'username', required: true });
  const pass = h('input', { id: 'pass', type: 'password', autocomplete: 'current-password', required: true });
  const err = h('div', { class: 'err', role: 'alert' });
  const btn = h('button', { class: 'primary', type: 'submit' }, 'Sign in');
  const widget = h('div', { id: 'captcha-box' });
  const form = h('form', { class: 'form narrow' },
    h('div', { class: 'field' }, h('label', { for: 'email' }, 'Email'), email),
    h('div', { class: 'field' }, h('label', { for: 'pass' }, 'Password'), pass),
    widget, err, btn);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    err.textContent = '';
    if (TURNSTILE_SITE_KEY && !token) { err.textContent = 'Complete the captcha first.'; return; }
    busy(btn, true, 'Sign in');
    const { error } = await sb.auth.signInWithPassword({
      email: email.value.trim(), password: pass.value,
      options: token ? { captchaToken: token } : undefined,
    });
    busy(btn, false, 'Sign in');
    if (error) {
      err.textContent = friendly(error);
      if (window.turnstile) window.turnstile.reset();
      token = null;
    }
  });
  shell('Sign in', form);
  if (TURNSTILE_SITE_KEY) {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.onload = () => window.turnstile.render('#captcha-box', { sitekey: TURNSTILE_SITE_KEY, callback: (t) => { token = t; } });
    document.head.append(s);
  }
}

/* ---------- home ---------- */
function viewHome() {
  const p = state.profile;
  const needProfile = !p || !p.full_name || !p.joining_date;
  const counts = {};
  const tile = (key) => {
    const sec = SECTIONS[key];
    counts[key] = h('span', { class: 'n' }, ' ');
    return h('a', { class: 'tile', href: `#/s/${key}` }, h('strong', {}, sec.label), h('span', {}, sec.blurb), counts[key]);
  };
  // Pages that are not entry sections
  counts.summaries = h('span', { class: 'n' }, ' ');
  counts.team = h('span', { class: 'n' }, ' ');
  const pages = {
    summaries: () => h('a', { class: 'tile', href: '#/summaries' }, h('strong', {}, 'One-page summaries'),
      h('span', {}, 'Rich-text summaries, several per project if needed'), counts.summaries),
    // Only the admin account manages teams, so other scientists never see this tile.
    team: () => (state.profile && state.profile.role === 'admin'
      ? h('a', { class: 'tile', href: '#/team' }, h('strong', {}, 'Team details'),
        h('span', {}, 'Teams, people, and who sits in which team'), counts.team) : null),
  };
  const make = (key) => (pages[key] ? pages[key]() : SECTIONS[key] && SECTIONS[key].enabled ? tile(key) : null);
  const placed = new Set(HOME_GROUPS.flatMap((g) => [...g.keys, ...(g.others || [])]));
  const stray = Object.keys(SECTIONS).filter((k) => SECTIONS[k].enabled && !placed.has(k));
  const body = HOME_GROUPS.map((g) => {
    const others = [...(g.others || []), ...(g.name === 'Output' ? stray : [])].map(make).filter(Boolean);
    return [
      h('h2', {}, g.name),
      h('div', { class: 'tiles' }, g.keys.map(make).filter(Boolean)),
      others.length ? h('details', { class: 'others' }, h('summary', {}, 'Others (less used)'), h('div', { class: 'tiles' }, others)) : null,
    ];
  });
  shell({ title: p && p.full_name ? `Hello, ${p.full_name.split(' ')[0]}` : 'Welcome', eyebrow: 'Home', sub: 'Choose a section to add or review your records.' },
    needProfile ? h('div', { class: 'flash warn' }, 'Complete your profile first. The joining date decides which entries count as "before joining". ',
      h('a', { href: '#/profile' }, 'Open profile')) : null,
    body);
  if (state.profile && state.profile.role === 'admin') {
    Promise.all([sb.from('teams').select('id', { count: 'exact', head: true }), sb.from('people').select('id', { count: 'exact', head: true })])
      .then(([t, p2]) => {
        if (t.count != null && p2.count != null) counts.team.textContent = `${t.count} ${t.count === 1 ? 'team' : 'teams'} · ${p2.count} ${p2.count === 1 ? 'person' : 'people'}`;
      });
  }
  sb.from('entries').select('section').then(({ data }) => {
    if (!data) return;
    const n = {};
    data.forEach((r) => { n[r.section] = (n[r.section] || 0) + 1; });
    for (const k of Object.keys(counts)) if (k !== 'summaries' && k !== 'team') counts[k].textContent = `${n[k] || 0} ${n[k] === 1 ? 'entry' : 'entries'}`;
    sb.from('summaries').select('slug,project_id,created_at,flag:blocks->>none').order('created_at', { ascending: false }).then(({ data: rows }) => {
      if (!rows) return;
      const seen = new Map();
      for (const r of rows) if (!seen.has(r.slug)) seen.set(r.slug, r);
      const real = [...seen.values()].filter((r) => r.project_id && !(r.flag === 'true' || r.flag === true));
      const projects = new Set(real.map((r) => r.project_id)).size;
      counts.summaries.textContent = `${real.length} ${real.length === 1 ? 'summary' : 'summaries'} · ${projects} of ${n.project || 0} projects`;
    });
  });
}

/* ---------- profile ---------- */
function viewProfile() {
  const p = state.profile || {};
  const form = buildForm(PROFILE_FIELDS, p);
  const btn = h('button', { class: 'primary' }, 'Save profile');
  btn.addEventListener('click', async () => {
    if (!form.validate()) return;
    const vals = form.values();
    if (vals.orcid) vals.orcid = vals.orcid.replace(/^https?:\/\/orcid\.org\//, '');
    busy(btn, true, 'Save profile');
    const { error } = await sb.from('profiles').update(vals).eq('user_id', state.session.user.id);
    busy(btn, false, 'Save profile');
    if (error) { setFlash('error', friendly(error)); }
    else { await loadProfile(); setFlash('ok', 'Profile saved.'); }
    viewProfile();
  });
  shell({ title: 'My profile details', eyebrow: 'Profile', sub: 'These details fill the header of your Word profile.' }, form.el, h('div', { class: 'actions' }, btn));
}

/* ---------- section page: entries with filters ---------- */
const PAGE = 40;
async function viewList(key) {
  const sec = SECTIONS[key];
  if (!sec || !sec.enabled) return go('#/');
  loadingShell(sec.label);
  const { data, error } = await sb.from('entries').select('*').eq('section', key);
  if (error) return shell(sec.label, h('div', { class: 'flash error' }, friendly(error)));
  const f = (state.filters[key] ||= { q: '', period: 'all', from: '', to: '', before: 'all', sort: 'desc', facets: {} });
  let shown = PAGE;
  const listBox = h('div', {});
  const status = h('div', { class: 'status', 'aria-live': 'polite' });

  const sel = (label, value, options, onchange) => {
    const s = h('select', { 'aria-label': label }, options.map(([v, t]) => h('option', { value: v }, t)));
    s.value = value;
    s.addEventListener('change', () => { onchange(s.value); shown = PAGE; draw(); });
    return h('label', { class: 'fl' }, h('span', {}, label), s);
  };

  const years = yearsIn(data);
  const customBox = h('div', { class: 'fl-dates' });
  const drawCustom = () => {
    customBox.replaceChildren();
    if (f.period !== 'custom') return;
    const from = h('input', { type: 'date', value: f.from, 'aria-label': 'From date' });
    const to = h('input', { type: 'date', value: f.to, 'aria-label': 'To date' });
    from.addEventListener('change', () => { f.from = from.value; shown = PAGE; draw(); });
    to.addEventListener('change', () => { f.to = to.value; shown = PAGE; draw(); });
    customBox.append(h('label', { class: 'fl' }, h('span', {}, 'From'), from), h('label', { class: 'fl' }, h('span', {}, 'To'), to));
  };

  const periodSel = sel('Period', f.period, [['all', 'All time'], ['fy', 'Last financial year'], ['cy', 'Last calendar year'],
    ...years.map((y) => [y, `Year ${y}`]), ['custom', 'Custom range…']], (v) => { f.period = v; drawCustom(); });
  const controls = [periodSel, customBox];
  for (const fc of sec.filters || []) {
    const vals = facetValues(data, fc.key);
    if (vals.length < 2 && !f.facets[fc.key]) continue;
    controls.push(sel(fc.label, f.facets[fc.key] || '', [['', 'All'], ...vals.map((v) => [v, v])], (v) => { f.facets[fc.key] = v; }));
  }
  if (sec.beforeJoining) controls.push(sel('Joining', f.before, [['all', 'All'], ['before', 'Before joining'], ['after', 'After joining']], (v) => { f.before = v; }));
  controls.push(sel('Order', f.sort, [['desc', 'Newest first'], ['asc', 'Oldest first']], (v) => { f.sort = v; }));

  const search = h('input', { type: 'search', placeholder: 'Search this section…', 'aria-label': 'Search', value: f.q });
  search.addEventListener('input', () => { f.q = search.value; shown = PAGE; draw(); });
  const clear = h('button', { class: 'link' }, 'Clear filters');
  clear.addEventListener('click', () => {
    f.q = ''; f.period = 'all'; f.from = ''; f.to = ''; f.before = 'all'; f.facets = {};
    viewList(key);
  });
  const panel = h('details', { class: 'filters', open: isFiltered({ ...f, q: '' }) }, h('summary', {}, 'Filters'), h('div', { class: 'fl-grid' }, controls), clear);
  drawCustom();

  const cols = [
    { label: 'Date', cls: 'dt-date', get: (e) => dateCell(e) },
    ...(COLUMNS[key] || fallbackColumns(sec)),
    ...(state.isOwner ? [{ label: 'Website', get: (e) => (e.is_public ? pill(e.is_featured ? 'On home page' : 'On website', 'ok') : pill('Private')) }] : []),
  ];
  // The "before joining" mark rides along in the first text column so it needs no column of its own.
  const first = cols.findIndex((c) => c.primary);
  if (sec.beforeJoining && first > -1) {
    const base = cols[first].get;
    cols[first] = { ...cols[first], get: (e) => [base(e), e.before_joining ? pill('before joining', 'warn') : null] };
  }

  const remove = async (e) => {
    const { error: er } = await sb.from('entries').delete().eq('id', e.id);
    if (!er && key === 'project') await sb.from('summaries').delete().eq('project_id', e.id);
    setFlash(er ? 'error' : 'ok', er ? friendly(er) : 'Entry deleted.');
    viewList(key);
  };
  const actions = (e) => [iconLink(`#/s/${key}/${e.id}`, 'Edit this entry'), deleteButton('Delete this entry', () => remove(e))];

  function draw() {
    const rows = applyFilters(data, f, sec.summary);
    status.textContent = data.length === 0 ? '' : isFiltered(f)
      ? `Showing ${rows.length} of ${data.length} entries` : `${data.length} ${data.length === 1 ? 'entry' : 'entries'}`;
    if (!data.length) listBox.replaceChildren(h('p', { class: 'empty' }, 'No entries yet. Add your first one.'));
    else if (!rows.length) listBox.replaceChildren(h('p', { class: 'empty' }, 'Nothing matches these filters.'));
    else {
      const more = rows.length > shown
        ? h('button', { class: 'secondary', onclick: () => { shown += PAGE; draw(); } }, `Show ${Math.min(PAGE, rows.length - shown)} more`) : null;
      listBox.replaceChildren(...[dataTable({ columns: cols, rows: rows.slice(0, shown), actions, caption: sec.label }), more].filter(Boolean));
    }
  }

  const group = HOME_GROUPS.find((g) => [...g.keys, ...(g.others || [])].includes(key));
  shell({ title: sec.label, eyebrow: group ? group.name : false, sub: sec.blurb, action: { href: `#/s/${key}/new`, label: 'Add entry' } },
    data.length ? h('div', { class: 'find' }, search) : null, data.length ? panel : null, status, listBox);
  draw();
}

/* ---------- entry form (new or edit) ---------- */
async function viewEntry(key, id) {
  const sec = SECTIONS[key];
  if (!sec || !sec.enabled) return go('#/');
  let entry = null;
  if (id !== 'new') {
    loadingShell(sec.label);
    const { data, error } = await sb.from('entries').select('*').eq('id', id).maybeSingle();
    if (error || !data) { setFlash('error', error ? friendly(error) : 'Entry not found.'); return go(`#/s/${key}`); }
    entry = data;
  }
  const initial = entry ? {
    ...entry.data, start_date: entry.start_date, end_date: entry.end_date, before_joining: entry.before_joining,
    is_public: entry.is_public, is_featured: entry.is_featured,
  } : {};
  let fields = [
    ...sec.fields,
    ...(sec.beforeJoining ? [{ key: 'before_joining', type: 'checkbox', label: 'This was published or done before I joined ICMR-NIE' }] : []),
    ...(state.isOwner ? sec.siteFields || [] : []),
  ];
  // Team, research-area and programme lists come from the database, so a new team shows up without a code change.
  let lookupFailed = false;
  if (fields.some((f) => f.optionsFrom)) {
    if (!entry) loadingShell(sec.label);
    const lookups = await loadLookups();
    lookupFailed = lookups.failed;
    fields = resolveOptions(fields, lookups);
  }
  const form = buildForm(fields, initial);
  const joining = state.profile && state.profile.joining_date;

  // Auto-tick "before joining" from the start date until the user changes the box by hand.
  let manual = !!entry;
  if (sec.beforeJoining) {
    form.input('before_joining').addEventListener('change', () => { manual = true; });
    form.input('start_date').addEventListener('change', () => {
      if (!manual && joining) form.set('before_joining', !!form.input('start_date').value && form.input('start_date').value < joining);
    });
  }

  const dupBox = h('div', { class: 'flash warn', hidden: true });
  let existing = [];
  if (!entry && sec.dupKey) {
    const { data } = await sb.from('entries').select('*').eq('section', key);
    existing = data || [];
  }

  const msg = h('div', { class: 'err', role: 'alert' });
  const mk = (label, again) => {
    const b = h('button', { class: again ? 'secondary' : 'primary' }, label);
    b.addEventListener('click', async () => {
      msg.textContent = '';
      if (!form.validate()) return;
      const row = buildRow(key, sec, form.values());
      if (!entry && sec.dupKey && !dupBox.dataset.ok) {
        const k = sec.dupKey(row);
        if (existing.some((e) => sec.dupKey(e) === k)) {
          dupBox.hidden = false;
          dupBox.textContent = 'This looks like a duplicate of an entry you already saved. Press the button again to save it anyway.';
          dupBox.dataset.ok = '1';
          return;
        }
      }
      busy(b, true, label);
      const { error } = entry
        ? await sb.from('entries').update(row).eq('id', entry.id)
        : await sb.from('entries').insert(row);
      busy(b, false, label);
      if (error) { msg.textContent = friendly(error); return; }
      setFlash('ok', `Saved: ${sec.summary(row)}`);
      if (again) { viewEntry(key, 'new'); window.scrollTo(0, 0); } else go(`#/s/${key}`);
    });
    return b;
  };
  form.onChange(() => { delete dupBox.dataset.ok; dupBox.hidden = true; });
  shell({ title: entry ? 'Edit entry' : 'New entry', eyebrow: sec.label },
    joining || !sec.beforeJoining ? null : h('div', { class: 'flash warn' }, 'Add your joining date in your ', h('a', { href: '#/profile' }, 'profile'), ' so "before joining" is ticked for you.'),
    lookupFailed ? h('div', { class: 'flash warn' }, 'Could not load the team and research-area lists. Reload the page before saving, or the team may be left blank.') : null,
    form.el, dupBox, msg,
    h('div', { class: 'actions' }, mk(entry ? 'Save changes' : 'Save', false), entry ? null : mk('Save and add another', true),
      h('a', { class: 'btn', href: `#/s/${key}` }, 'Cancel')));
}

/* ---------- router ---------- */
async function route() {
  if (!state.session) return viewLogin();
  try {
    if (!state.profile) await loadProfile();
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    const ctx = { sb, shell, loadingShell, friendly, setFlash, go, state };
    if (parts[0] === 'profile') return viewProfile();
    if (parts[0] === 'website') return await viewWebsite(ctx);
    if (parts[0] === 'team') return await viewTeam(ctx, parts.slice(1));
    if (parts[0] === 'summaries') return await viewSummaries(ctx);
    if (parts[0] === 'summary' && parts[1]) return await viewSummaryEditor(ctx, parts[1], parts[2]);
    if (parts[0] === 'import') return viewImport(ctx);
    if (parts[0] === 'reports') return await viewReports(ctx);
    if (parts[0] === 'report') return await viewReportBuilder(ctx, parts[1]);
    if (parts[0] === 's' && parts[1] && parts[2]) return await viewEntry(parts[1], parts[2]);
    if (parts[0] === 's' && parts[1]) return await viewList(parts[1]);
    return viewHome();
  } catch (e) {
    shell('Something went wrong', h('div', { class: 'flash error' }, friendly(e)),
      h('button', { class: 'secondary', onclick: () => location.reload() }, 'Reload'));
  }
}

sb.auth.onAuthStateChange((event, session) => {
  const changed = (session && session.user.id) !== (state.session && state.session.user.id);
  state.session = session;
  if (changed) { state.profile = null; state.isOwner = false; state.filters = {}; if (!session) location.hash = ''; }
  // Re-render only on first load or when the user changes. Token refreshes and tab refocus must not wipe a half-filled form.
  // Defer with setTimeout: calling the database inside this callback can deadlock the auth client.
  if (changed || event === 'INITIAL_SESSION') setTimeout(route, 0);
});
window.addEventListener('hashchange', route);
