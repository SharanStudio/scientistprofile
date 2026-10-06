import { sb } from './supabase.js';
import { TURNSTILE_SITE_KEY } from './config.js';
import { h } from './dom.js';
import { buildForm } from './forms.js';
import { SECTIONS, PROFILE_FIELDS, fmtDate } from './sections.js';

const root = document.getElementById('app');
const state = { session: null, profile: null, flash: null };

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
  const tiles = Object.entries(SECTIONS).map(([key, s]) => s.enabled
    ? h('a', { class: 'tile', href: `#/s/${key}/new` }, h('strong', {}, s.label), h('span', {}, s.blurb))
    : h('div', { class: 'tile soon', 'aria-disabled': 'true' }, h('strong', {}, s.label), h('span', {}, 'Coming in a later stage')));
  shell(p && p.full_name ? `Hello, ${p.full_name.split(' ')[0]}` : 'Welcome',
    needProfile ? h('div', { class: 'flash warn' }, 'Complete your profile first. The joining date decides which entries count as "before joining". ',
      h('a', { href: '#/profile' }, 'Open profile')) : null,
    h('h2', {}, 'What do you want to enter today?'),
    h('div', { class: 'tiles' }, tiles),
    h('h2', {}, 'Review what you entered'),
    h('div', { class: 'tiles' }, Object.entries(SECTIONS).filter(([, s]) => s.enabled).map(([key, s]) =>
      h('a', { class: 'tile ghost', href: `#/s/${key}` }, h('strong', {}, `${s.label} list`), h('span', {}, 'View, edit or delete')))));
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

/* ---------- entry list ---------- */
async function viewList(key) {
  const sec = SECTIONS[key];
  if (!sec || !sec.enabled) return go('#/');
  loadingShell(sec.label);
  const { data, error } = await sb.from('entries').select('*').eq('section', key)
    .order('start_date', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  if (error) return shell(sec.label, h('div', { class: 'flash error' }, friendly(error)));
  const rows = data.map((e) => {
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
      h('div', { class: 'row-main' }, sec.summary(e),
        e.before_joining ? h('span', { class: 'tag' }, 'before joining') : null),
      h('div', { class: 'row-actions' }, h('a', { href: `#/s/${key}/${e.id}` }, 'Edit'), del));
  });
  shell(`${sec.label} (${data.length})`,
    h('div', { class: 'toolbar' }, h('a', { class: 'btn primary', href: `#/s/${key}/new` }, 'Add entry')),
    rows.length ? h('ul', { class: 'rows' }, rows) : h('p', { class: 'empty' }, 'No entries yet.'));
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
  const fields = [...sec.fields, { key: 'before_joining', type: 'checkbox', label: 'This happened before I joined ICMR-NIE' }];
  const form = buildForm(fields, initial);
  const joining = state.profile && state.profile.joining_date;

  // Auto-tick "before joining" from the start date until the user changes the box by hand.
  let manual = !!entry;
  form.input('before_joining').addEventListener('change', () => { manual = true; });
  form.input('start_date').addEventListener('change', () => {
    if (!manual && joining) form.set('before_joining', !!form.input('start_date').value && form.input('start_date').value < joining);
  });

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
      const { start_date, end_date, before_joining, ...data } = v;
      const row = { section: key, start_date, end_date: end_date || null, ongoing: false, before_joining: !!before_joining, data };
      if (!entry && sec.dupKey && !dupBox.dataset.ok) {
        const k = sec.dupKey(row);
        if (existing.some((e) => sec.dupKey(e) === k)) {
          dupBox.hidden = false;
          dupBox.textContent = 'An entry with the same date, project and district already exists. Press the button again to save it anyway.';
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
    joining ? null : h('div', { class: 'flash warn' }, 'Add your joining date in your ', h('a', { href: '#/profile' }, 'profile'), ' so "before joining" is ticked for you.'),
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
  if (changed) { state.profile = null; if (!session) location.hash = ''; }
  // Re-render only on first load or when the user changes. Token refreshes and tab refocus must not wipe a half-filled form.
  // Defer with setTimeout: calling the database inside this callback can deadlock the auth client.
  if (changed || event === 'INITIAL_SESSION') setTimeout(route, 0);
});
window.addEventListener('hashchange', route);
