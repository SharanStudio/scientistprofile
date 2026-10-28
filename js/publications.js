import { h } from './dom.js';
import { icon, iconLink, iconButton, deleteButton, dataTable, pill } from './ui.js';
import { loadLookups } from './lookups.js';
import { yearsIn } from './filters.js';
import {
  splitKinds, matchesQuery, yearOf, flagPatch, displayNum,
  emptyPubFilters, pubFilterCount, matchesFilters, typeOptions, nextSort, sortRows,
} from './pub-data.js';

// The Publications page: a Filters accordion, then two accordions (research, non-research), each as a table or as cards.
// Public view and Home page view are tick boxes that save the moment you change them. Only the site owner sees the
// website columns and the tick boxes, as on the entry forms. Areas of interest are set in the entry form only; the search box still finds them.
// Table headings sort their own accordion. Cards have no headings, so they get a "Sort by" list instead.
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

// Only real web links become clickable. The entry form already enforces https://, this guards older or imported rows.
const safeUrl = (u) => (typeof u === 'string' && /^https?:\/\/\S+$/i.test(u.trim()) ? u.trim() : '');

const SORT_CHOICES = [
  ['', 'Newest first (default)'],
  ['year:asc', 'Year, oldest first'],
  ['year:desc', 'Year, newest first'],
  ['title:asc', 'Title, A to Z'],
  ['title:desc', 'Title, Z to A'],
  ['journal:asc', 'Journal, A to Z'],
  ['journal:desc', 'Journal, Z to A'],
  ['impact:desc', 'Impact factor, high to low'],
  ['impact:asc', 'Impact factor, low to high'],
];

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
  const f = (state.filters.__pubs ||= emptyPubFilters());   // kept while you open an entry and come back; cleared on sign-out
  const sorts = { research: null, non: null };
  const open = { research: true, non: true };
  const status = h('div', { class: 'status', role: 'status', 'aria-live': 'polite' });
  const listBox = h('div', { class: 'acc-list' });
  let refocus = null;
  let refocusSort = null;

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
  // A real tick box: big tap target, works with a keyboard and a screen reader without extra code.
  function sw(e, which, text) {
    const on = which === 'public' ? !!e.is_public : !!e.is_featured;
    const blocked = which === 'home' && !e.is_public;
    const b = h('input', {
      type: 'checkbox', class: 'cb', checked: on, 'aria-label': text, 'data-sw': `${e.id}:${which}`,
      title: blocked ? 'Turn on Public view first' : text,
    });
    b.checked = on;
    if (blocked) b.disabled = true;
    b.addEventListener('change', () => setFlags(e, which));
    return b;
  }
  const titleNode = (e) => {
    const t = (e.data || {}).title;
    const node = t ? h('span', { class: 'pub-title' }, t)
      : h('a', { class: 'pub-missing', href: `#/s/${SECTION}/${e.id}` }, 'Title missing. Add it');
    return h('span', {}, node, e.before_joining ? pill('before joining', 'warn') : null);
  };
  // The publication's web link: opens in a new tab, or a dash when none is saved.
  const linkNode = (e) => {
    const url = safeUrl((e.data || {}).link);
    return url
      ? h('a', { class: 'pub-link', href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Open the publication link in a new tab' }, icon('open', 16), ' Open')
      : '–';
  };

  /* ----- table definitions ----- */
  const siteCols = () => (owner ? [
    { label: 'Public view', get: (e) => sw(e, 'public', 'Public view') },
    { label: 'Home page view', get: (e) => sw(e, 'home', 'Home page view') },
  ] : []);
  const researchCols = [
    { label: 'Year', cls: 'dt-date', sortKey: 'year', get: (e) => yearOf(e) },
    { label: 'Title', primary: true, sortKey: 'title', get: titleNode },
    { label: 'Journal name', sortKey: 'journal', get: (e) => displayNum((e.data || {}).journal_name) },
    { label: 'Impact factor', sortKey: 'impact', get: (e) => displayNum((e.data || {}).impact_factor) },
    ...siteCols(),
  ];
  const nonResearchCols = [
    { label: 'Year', cls: 'dt-date', sortKey: 'year', get: (e) => yearOf(e) },
    { label: 'Title', primary: true, sortKey: 'title', get: titleNode },
    { label: 'Type', sortKey: 'type', get: (e) => displayNum((e.data || {}).nr_type) },
    { label: 'Link', get: linkNode },
    ...siteCols(),
  ];

  /* ----- cards ----- */
  function card(e, isResearch) {
    const d = e.data || {};
    const meta = isResearch
      ? [d.journal_name, d.impact_factor != null && d.impact_factor !== '' ? `IF ${d.impact_factor}` : null].filter(Boolean).join(' · ')
      : d.nr_type || '';
    const url = isResearch ? '' : safeUrl(d.link);
    return h('article', { class: 'pub-card' },
      h('div', { class: 'pub-card-top' }, h('span', { class: 'pub-year' }, yearOf(e)), isResearch ? null : pill(d.nr_type || 'Non-research')),
      h('h3', { class: 'pub-card-title' }, titleNode(e)),
      meta ? h('p', { class: 'pub-meta' }, meta) : null,
      url ? h('p', { class: 'pub-meta' }, linkNode(e)) : null,
      owner ? h('div', { class: 'sw-rows' },
        h('label', { class: 'sw-row' }, h('span', {}, 'Public view'), sw(e, 'public', 'Public view')),
        h('label', { class: 'sw-row' }, h('span', {}, 'Home page view'), sw(e, 'home', 'Home page view'))) : null,
      h('div', { class: 'dt-btns pub-card-act' }, actionsOf(e)));
  }

  /* ----- accordions ----- */
  const narrowed = () => !!q.trim() || pubFilterCount(f) > 0;
  function onSort(key, sortKey) {
    sorts[key] = nextSort(sorts[key], sortKey);
    refocusSort = `${key}:${sortKey}`;
    syncSortSelect();
    draw();
  }
  function accordion(key, title, rows, all, isResearch) {
    const count = narrowed() ? `${rows.length} of ${all.length}` : String(all.length);
    const det = h('details', { class: 'acc', open: open[key], 'data-acc': key },
      h('summary', {}, h('span', { class: 'acc-name' }, title), h('span', { class: 'acc-count' }, count), icon('chevron', 18)));
    det.addEventListener('toggle', () => { open[key] = det.open; });
    let body;
    if (!all.length) body = h('p', { class: 'empty' }, `No ${title.toLowerCase()} yet. `, h('a', { href: `#/s/${SECTION}/new` }, 'Add one'));
    else if (!rows.length) body = h('p', { class: 'empty' }, 'Nothing matches this search or these filters.');
    else if (view === 'cards') body = h('div', { class: 'pub-cards' }, rows.map((e) => card(e, isResearch)));
    else {
      body = dataTable({
        columns: isResearch ? researchCols : nonResearchCols, rows, actions: actionsOf, caption: title,
        sort: sorts[key], onSort: (k) => onSort(key, k),
      });
    }
    det.append(body);
    return det;
  }

  function draw() {
    const { research, non } = splitKinds(data);
    const keep = (rows, key) => sortRows(rows.filter((e) => matchesQuery(e, q, areas) && matchesFilters(e, f)), sorts[key]);
    listBox.replaceChildren(
      accordion('research', 'Research publications', keep(research, 'research'), research, true),
      accordion('non', 'Non-research publications', keep(non, 'non'), non, false));
    const n = pubFilterCount(f);
    badge.textContent = n ? String(n) : '';
    badge.hidden = !n;
    if (refocus) {
      const el = listBox.querySelector(`[data-sw="${refocus}"]`);
      if (el && !el.disabled) el.focus();
      refocus = null;
    }
    if (refocusSort) {
      const [a, k] = refocusSort.split(':');
      const el = listBox.querySelector(`[data-acc="${a}"] [data-sort="${k}"]`);
      if (el) el.focus();
      refocusSort = null;
    }
  }

  /* ----- filters ----- */
  const controls = [];   // [key, element] pairs, so "Clear filters" can reset what you see
  const field = (text, key, options) => {
    const s = h('select', { 'aria-label': text }, options.map(([v, t]) => h('option', { value: v }, t)));
    s.value = f[key];
    s.addEventListener('change', () => { f[key] = s.value; if (key === 'period') drawCustom(); draw(); });
    controls.push([key, s]);
    return h('label', { class: 'fl' }, h('span', {}, text), s);
  };
  const numField = (text, key) => {
    const i = h('input', { type: 'number', min: '0', step: 'any', inputmode: 'decimal', 'aria-label': text, placeholder: 'Any' });
    i.value = f[key];
    i.addEventListener('input', () => { f[key] = i.value; draw(); });
    controls.push([key, i]);
    return h('label', { class: 'fl' }, h('span', {}, text), i);
  };
  const customBox = h('div', { class: 'fl-dates' });
  function drawCustom() {
    customBox.replaceChildren();
    if (f.period !== 'custom') return;
    const from = h('input', { type: 'date', 'aria-label': 'From date' });
    const to = h('input', { type: 'date', 'aria-label': 'To date' });
    from.value = f.from; to.value = f.to;
    from.addEventListener('change', () => { f.from = from.value; draw(); });
    to.addEventListener('change', () => { f.to = to.value; draw(); });
    customBox.append(h('label', { class: 'fl' }, h('span', {}, 'From'), from), h('label', { class: 'fl' }, h('span', {}, 'To'), to));
  }

  const badge = h('span', { class: 'acc-count', hidden: true });
  const gridKids = [
    field('Period', 'period', [['all', 'All time'], ['fy', 'Last financial year'], ['cy', 'Last calendar year'],
      ...yearsIn(data).map((y) => [y, `Year ${y}`]), ['custom', 'Custom range…']]),
    customBox,
    field('Type', 'type', [['', 'All'], ...typeOptions(data).map((t) => [t, t])]),
    field('Journal level', 'level', [['', 'All'], ['National', 'National'], ['International', 'International']]),
    field('Your role', 'role', [['', 'All'], ['First author', 'First author'], ['Corresponding author', 'Corresponding author'], ['Co-author', 'Co-author']]),
    numField('Impact factor, from', 'ifMin'),
    numField('Impact factor, to', 'ifMax'),
    field('Joining', 'before', [['all', 'All'], ['before', 'Before joining'], ['after', 'After joining']]),
    ...(owner ? [
      field('Public view', 'pub', [['all', 'All'], ['yes', 'On'], ['no', 'Off']]),
      field('Home page view', 'home', [['all', 'All'], ['yes', 'On'], ['no', 'Off']]),
    ] : []),
  ];
  const clear = h('button', { type: 'button', class: 'link' }, 'Clear filters');
  clear.addEventListener('click', () => {
    Object.assign(f, emptyPubFilters());
    for (const [key, el] of controls) el.value = f[key];
    drawCustom();
    draw();
  });
  const panel = h('details', { class: 'filters', open: pubFilterCount(f) > 0 },
    h('summary', {}, 'Filters ', badge),
    h('div', { class: 'fl-grid' }, gridKids),
    h('p', { class: 'sub' }, 'Journal level, your role and impact factor apply to research publications only. Setting one hides non-research entries.'),
    clear);
  drawCustom();

  /* ----- toolbar ----- */
  const search = h('input', { type: 'search', placeholder: 'Search title, journal, year, area…', 'aria-label': 'Search publications' });
  search.addEventListener('input', () => { q = search.value; draw(); });
  const segBtn = (value, text) => {
    const b = h('button', { type: 'button', class: `seg-b${view === value ? ' on' : ''}`, 'aria-pressed': view === value ? 'true' : 'false' }, text);
    b.addEventListener('click', () => {
      view = value; saveView(value);
      for (const x of bar.querySelectorAll('.seg-b')) { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false'); }
      sortWrap.hidden = view !== 'cards';
      draw();
    });
    return b;
  };
  const bar = h('div', { class: 'pubs-bar' }, h('div', { class: 'find' }, search),
    h('div', { class: 'seg', role: 'group', 'aria-label': 'Layout' }, segBtn('table', 'Table'), segBtn('cards', 'Cards')));

  // Cards have no column headings, so they sort from a list. It sets both accordions at once.
  const sortSel = h('select', { id: 'pub-sort', 'aria-label': 'Sort publications by' }, SORT_CHOICES.map(([v, t]) => h('option', { value: v }, t)));
  sortSel.addEventListener('change', () => {
    const [key, dir] = sortSel.value ? sortSel.value.split(':') : [null, null];
    sorts.research = key ? { key, dir } : null;
    sorts.non = key ? { key, dir } : null;
    draw();
  });
  function syncSortSelect() {
    const s = sorts.research;
    const v = s ? `${s.key}:${s.dir}` : '';
    sortSel.value = SORT_CHOICES.some(([x]) => x === v) ? v : '';
  }
  const sortWrap = h('div', { class: 'pubs-sort', hidden: view !== 'cards' }, h('label', { for: 'pub-sort' }, 'Sort by'), sortSel);

  const group = 'Output';
  shell({ title: label, eyebrow: group, sub: 'Research and non-research outputs', action: { href: `#/s/${SECTION}/new`, label: 'Add entry' } },
    data.length ? bar : null, data.length ? panel : null, data.length ? sortWrap : null, status, listBox);
  draw();
}
