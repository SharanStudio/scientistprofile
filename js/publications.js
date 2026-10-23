import { h } from './dom.js';
import { icon, iconLink, iconButton, deleteButton, dataTable, pill } from './ui.js';
import { loadLookups } from './lookups.js';
import { splitKinds, matchesQuery, yearOf, areasText, flagPatch, displayNum } from './pub-data.js';

// The Publications page: two accordions (research, non-research), each as a table or as cards.
// Public view and Home page view are switches that save the moment you flip them. Only the site owner sees the
// website columns, the areas of interest and the switches, as on the entry forms.
const VIEW_KEY = 'sp.pubView';
const SECTION = 'publication';

function savedView() {
  try { const v = localStorage.getItem(VIEW_KEY); if (v === 'table' || v === 'cards') return v; } catch { /* storage can be blocked */ }
  return window.matchMedia && window.matchMedia('(max-width: 700px)').matches ? 'cards' : 'table';
}
function saveView(v) { try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } }

async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through to the old way */ }
  try {
    const ta = h('textarea', { readonly: true, 'aria-hidden': 'true', style: 'position:fixed;opacity:0;top:0;left:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

export async function viewPublications({ sb, shell, loadingShell, friendly, state }) {
  const label = 'Publications';
  loadingShell(label);
  const [res, lookups] = await Promise.all([sb.from('entries').select('*').eq('section', SECTION), loadLookups()]);
  if (res.error) return shell(label, h('div', { class: 'flash error' }, friendly(res.error)));
  const data = res.data || [];
  const areas = lookups.research_areas || [];
  const owner = !!state.isOwner;

  let view = savedView();
  let q = '';
  const open = { research: true, non: true };
  const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const listBox = h('div', { class: 'acc-list' });
  let refocus = null;

  const say = (text, bad = false) => { status.textContent = text; status.className = bad ? 'status bad' : 'status'; };

  /* ----- actions ----- */
  async function setFlags(e, which) {
    const patch = flagPatch(e, which);
    if (!patch) return;
    const prev = { is_public: e.is_public, is_featured: e.is_featured };
    Object.assign(e, patch);
    refocus = `${e.id}:${which}`;
    draw();
    const { error } = await sb.from('entries').update(patch).eq('id', e.id);
    if (error) { Object.assign(e, prev); say(friendly(error), true); draw(); } else say('Saved.');
  }
  async function remove(e) {
    const { error } = await sb.from('entries').delete().eq('id', e.id);
    if (error) { say(friendly(error), true); return; }
    data.splice(data.indexOf(e), 1);
    say('Entry deleted.');
    draw();
  }
  function copyButton(name, text, what, empty) {
    const b = iconButton(name, `Copy ${what}`, async () => {
      const ok = await copyText(text);
      say(ok ? `${what[0].toUpperCase()}${what.slice(1)} copied.` : 'Could not copy. Select the text and copy it by hand.', !ok);
      if (ok) { b.replaceChildren(icon('check')); setTimeout(() => b.replaceChildren(icon(name)), 1500); }
    });
    if (!text) { b.disabled = true; b.title = empty; b.setAttribute('aria-label', empty); }
    return b;
  }
  const actionsOf = (e) => [
    copyButton('copy', (e.data || {}).citation, 'citation', 'No citation saved'),
    copyButton('link', (e.data || {}).doi, 'DOI', 'No DOI saved'),
    iconLink(`#/s/${SECTION}/${e.id}`, 'Edit this entry'),
    deleteButton('Delete this entry', () => remove(e)),
  ];

  /* ----- pieces ----- */
  function sw(e, which, text) {
    const on = which === 'public' ? !!e.is_public : !!e.is_featured;
    const blocked = which === 'home' && !e.is_public;
    const b = h('button', {
      type: 'button', class: `sw${on ? ' on' : ''}`, role: 'switch', 'aria-checked': on ? 'true' : 'false',
      'aria-label': `${text}: ${on ? 'on' : 'off'}`, 'data-sw': `${e.id}:${which}`,
      title: blocked ? 'Turn on Public view first' : text,
    }, h('span', { class: 'sw-knob' }));
    if (blocked) b.disabled = true;
    b.addEventListener('click', () => setFlags(e, which));
    return b;
  }
  const titleNode = (e) => {
    const t = (e.data || {}).title;
    const node = t ? h('span', { class: 'pub-title' }, t)
      : h('a', { class: 'pub-missing', href: `#/s/${SECTION}/${e.id}` }, 'Title missing. Add it');
    return h('span', {}, node, e.before_joining ? pill('before joining', 'warn') : null);
  };

  /* ----- table definitions ----- */
  const siteCols = () => (owner ? [
    { label: 'Public view', get: (e) => sw(e, 'public', 'Public view') },
    { label: 'Home page view', get: (e) => sw(e, 'home', 'Home page view') },
    { label: 'Areas of interest', get: (e) => areasText(e, areas) },
  ] : []);
  const researchCols = [
    { label: 'Year', cls: 'dt-date', get: (e) => yearOf(e) },
    { label: 'Title', primary: true, get: titleNode },
    { label: 'Journal name', get: (e) => displayNum((e.data || {}).journal_name) },
    { label: 'Impact factor', get: (e) => displayNum((e.data || {}).impact_factor) },
    ...siteCols(),
  ];
  const nonResearchCols = [
    { label: 'Year', cls: 'dt-date', get: (e) => yearOf(e) },
    { label: 'Title', primary: true, get: titleNode },
    { label: 'Type', get: (e) => displayNum((e.data || {}).nr_type) },
    ...siteCols(),
  ];

  /* ----- cards ----- */
  function card(e, isResearch) {
    const d = e.data || {};
    const meta = isResearch
      ? [d.journal_name, d.impact_factor != null && d.impact_factor !== '' ? `IF ${d.impact_factor}` : null].filter(Boolean).join(' · ')
      : d.nr_type || '';
    const areasLine = owner ? areasText(e, areas) : '–';
    return h('article', { class: 'pub-card' },
      h('div', { class: 'pub-card-top' }, h('span', { class: 'pub-year' }, yearOf(e)), isResearch ? null : pill(d.nr_type || 'Non-research')),
      h('h3', { class: 'pub-card-title' }, titleNode(e)),
      meta ? h('p', { class: 'pub-meta' }, meta) : null,
      owner && areasLine !== '–' ? h('p', { class: 'pub-areas' }, areasLine) : null,
      owner ? h('div', { class: 'sw-rows' },
        h('div', { class: 'sw-row' }, h('span', {}, 'Public view'), sw(e, 'public', 'Public view')),
        h('div', { class: 'sw-row' }, h('span', {}, 'Home page view'), sw(e, 'home', 'Home page view'))) : null,
      h('div', { class: 'dt-btns pub-card-act' }, actionsOf(e)));
  }

  /* ----- accordions ----- */
  function accordion(key, title, rows, all, isResearch) {
    const count = q.trim() ? `${rows.length} of ${all.length}` : String(all.length);
    const det = h('details', { class: 'acc', open: open[key] },
      h('summary', {}, h('span', { class: 'acc-name' }, title), h('span', { class: 'acc-count' }, count), icon('chevron', 18)));
    det.addEventListener('toggle', () => { open[key] = det.open; });
    let body;
    if (!all.length) body = h('p', { class: 'empty' }, `No ${title.toLowerCase()} yet. `, h('a', { href: `#/s/${SECTION}/new` }, 'Add one'));
    else if (!rows.length) body = h('p', { class: 'empty' }, 'Nothing matches this search.');
    else if (view === 'cards') body = h('div', { class: 'pub-cards' }, rows.map((e) => card(e, isResearch)));
    else body = dataTable({ columns: isResearch ? researchCols : nonResearchCols, rows, actions: actionsOf, caption: title });
    det.append(body);
    return det;
  }

  function draw() {
    const { research, non } = splitKinds(data);
    const keep = (rows) => rows.filter((e) => matchesQuery(e, q, areas));
    listBox.replaceChildren(
      accordion('research', 'Research publications', keep(research), research, true),
      accordion('non', 'Non-research publications', keep(non), non, false));
    if (refocus) {
      const el = listBox.querySelector(`[data-sw="${refocus}"]`);
      if (el && !el.disabled) el.focus();
      refocus = null;
    }
  }

  /* ----- toolbar ----- */
  const search = h('input', { type: 'search', placeholder: 'Search title, journal, year, area…', 'aria-label': 'Search publications' });
  search.addEventListener('input', () => { q = search.value; draw(); });
  const segBtn = (value, text) => {
    const b = h('button', { type: 'button', class: `seg-b${view === value ? ' on' : ''}`, 'aria-pressed': view === value ? 'true' : 'false' }, text);
    b.addEventListener('click', () => {
      view = value; saveView(value);
      for (const x of bar.querySelectorAll('.seg-b')) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      draw();
    });
    return b;
  };
  const bar = h('div', { class: 'pubs-bar' }, h('div', { class: 'find' }, search),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Layout' }, segBtn('table', 'Table'), segBtn('cards', 'Cards')));

  const group = 'Output';
  shell({ title: label, eyebrow: group, sub: 'Research and non-research outputs', action: { href: `#/s/${SECTION}/new`, label: 'Add entry' } },
    data.length ? bar : null, status, listBox);
  draw();
}
