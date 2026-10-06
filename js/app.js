import { sb } from './supabase.js';
import { TURNSTILE_SITE_KEY } from './config.js';
import { h } from './dom.js';
import { buildForm } from './forms.js';
import { SECTIONS, PROFILE_FIELDS } from './sections.js';
import { applyFilters, facetValues, yearsIn, isFiltered } from './filters.js';

const root = document.getElementById('app');
const state = { session: null, profile: null, flash: null, filters: {} };

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
  return data;
}

/* ---------- shell ---------- */
function shell(title, ...content) { return render(title, true, content); }
function loadingShell(title) { return render(title, false, [h('p', {}, 'Loading…')]); }
function render(title, withFlash, content) {
  const nav = state.session ? h('nav', {},
    h('a', { href: '#/' }, 'Home'),
    h('a', { href: '#/profile' }, 'Profile'),
    h('button', { class: 'link', onclick: async () => { await sb.auth.signOut(); } }, 'Sign out')) : null;
  root.replaceChildren(
    h('header', { class: 'top' }, h('a', { class: 'brand', href: '#/' }, 'Scientist Profile'), nav),
    h('main', {}, title ? h('h1', {}, title) : null, withFlash ? takeFlash() : null, ...content));
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
  const groups = {};
  for (const [key, sec] of Object.entries(SECTIONS)) {
    counts[key] = h('span', { class: 'n' }, ' ');
    (groups[sec.group] ||= []).push(h('a', { class: 'tile', href: `#/s/${key}` }, h('strong', {}, sec.label), h('span', {}, sec.blurb), counts[key]));
  }
  shell(p && p.full_name ? `Hello, ${p.full_name.split(' ')[0]}` : 'Welcome',
    needProfile ? h('div', { class: 'flash warn' }, 'Complete your profile first. The joining date decides which entries count as "before joining". ',
      h('a', { href: '#/profile' }, 'Open profile')) : null,
    Object.entries(groups).map(([name, tiles]) => [h('h2', {}, name), h('div', { class: 'tiles' }, tiles)]));
  sb.from('entries').select('section').then(({ data }) => {
    if (!data) return;
    const n = {};
    data.forEach((r) => { n[r.section] = (n[r.section] || 0) + 1; });
    for (const k of Object.keys(counts)) counts[k].textContent = `${n[k] || 0} ${n[k] === 1 ? 'entry' : 'entries'}`;
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
  shell('Profile', h('p', { class: 'lede' }, 'These details fill the header of your Word profile.'), form.el, h('div', { class: 'actions' }, btn));
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

  function row(e) {
    const del = h('button', { class: 'link danger' }, 'Delete');
    let armed = null;
    del.addEventListener('click', async () => {
      if (!armed) {
        del.textContent = 'Tap again to confirm';
        armed = setTimeout(() => { armed = null; del.textContent = 'Delete'; }, 4000);
        return;
      }
      clearTimeout(armed);
      const { error: er } = await sb.from('entries').delete().eq('id', e.id);
      setFlash(er ? 'error' : 'ok', er ? friendly(er) : 'Entry deleted.');
      viewList(key);
    });
    return h('li', { class: 'row' },
      h('div', { class: 'row-main' }, sec.summary(e), e.before_joining ? h('span', { class: 'tag' }, 'before joining') : null),
      h('div', { class: 'row-actions' }, h('a', { href: `#/s/${key}/${e.id}` }, 'Edit'), del));
  }

  function draw() {
    const rows = applyFilters(data, f, sec.summary);
    status.textContent = data.length === 0 ? '' : isFiltered(f)
      ? `Showing ${rows.length} of ${data.length} entries` : `${data.length} ${data.length === 1 ? 'entry' : 'entries'}`;
    if (!data.length) listBox.replaceChildren(h('p', { class: 'empty' }, 'No entries yet. Add your first one.'));
    else if (!rows.length) listBox.replaceChildren(h('p', { class: 'empty' }, 'Nothing matches these filters.'));
    else {
      const more = rows.length > shown
        ? h('button', { class: 'secondary', onclick: () => { shown += PAGE; draw(); } }, `Show ${Math.min(PAGE, rows.length - shown)} more`) : null;
      listBox.replaceChildren(h('ul', { class: 'rows' }, rows.slice(0, shown).map(row)), more);
    }
  }

  shell(sec.label,
    h('div', { class: 'toolbar' }, h('a', { class: 'btn primary', href: `#/s/${key}/new` }, 'Add entry')),
    data.length ? [search, panel] : null, status, listBox);
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
  const initial = entry ? { ...entry.data, start_date: entry.start_date, end_date: entry.end_date, before_joining: entry.before_joining } : {};
  const fields = sec.beforeJoining
    ? [...sec.fields, { key: 'before_joining', type: 'checkbox', label: 'This was published or done before I joined ICMR-NIE' }]
    : sec.fields;
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
      const v = form.values();
      const { start_date, end_date, before_joining, ...rest } = v;
      const data = sec.finalise ? sec.finalise(rest) : rest;
      const row = { section: key, start_date, end_date: end_date || null,
        ongoing: sec.ongoingFrom ? !!sec.ongoingFrom(data) : (!!sec.ongoingIfBlank && !end_date), before_joining: !!before_joining, data };
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
  shell(entry ? `Edit: ${sec.label}` : `New: ${sec.label}`,
    joining || !sec.beforeJoining ? null : h('div', { class: 'flash warn' }, 'Add your joining date in your ', h('a', { href: '#/profile' }, 'profile'), ' so "before joining" is ticked for you.'),
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
    if (parts[0] === 'profile') return viewProfile();
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
  if (changed) { state.profile = null; state.filters = {}; if (!session) location.hash = ''; }
  // Re-render only on first load or when the user changes. Token refreshes and tab refocus must not wipe a half-filled form.
  // Defer with setTimeout: calling the database inside this callback can deadlock the auth client.
  if (changed || event === 'INITIAL_SESSION') setTimeout(route, 0);
});
window.addEventListener('hashchange', route);
