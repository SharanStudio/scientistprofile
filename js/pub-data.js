// Pure helpers for the Publications page. No DOM and no database here, so they run in Node tests too.
import { periodRange, overlaps } from './filters.js';

export const RESEARCH = 'Research publication';
export const NON_RESEARCH = 'Non-research publication';

export const yearOf = (e) => (e.start_date ? e.start_date.slice(0, 4) : '–');

// Research areas are saved as slugs in data.research_areas. `areas` is the lookup list [{ value, label }].
export function areasText(e, areas = []) {
  const names = new Map(areas.map((a) => [a.value, a.label]));
  const v = (e.data || {}).research_areas;
  return Array.isArray(v) && v.length ? v.map((s) => names.get(s) || s).join(', ') : '–';
}

// What a click on a switch should save, or null when the click does nothing.
// Public view off always clears Home page view, so a record can never be featured without being public.
export function flagPatch(e, which) {
  if (which === 'public') {
    const on = !e.is_public;
    return { is_public: on, is_featured: on ? !!e.is_featured : false };
  }
  if (!e.is_public) return null;
  return { is_featured: !e.is_featured };
}

const byNewest = (a, b) => {
  const x = a.start_date || '';
  const y = b.start_date || '';
  if (x !== y) return x < y ? 1 : -1;
  return String((a.data || {}).title || '').localeCompare(String((b.data || {}).title || ''));
};

// True when the entry matches the search box (title, journal, citation, type, areas, year, DOI).
export function matchesQuery(e, q, areas = []) {
  const text = (q || '').trim().toLowerCase();
  if (!text) return true;
  const d = e.data || {};
  const hay = [d.title, d.journal_name, d.citation, d.type, d.nr_type, d.doi, d.link, yearOf(e), areasText(e, areas)]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(text);
}

// Splits all publication entries into the two lists, newest first.
export function splitKinds(rows) {
  const research = rows.filter((e) => (e.data || {}).kind === RESEARCH).sort(byNewest);
  const non = rows.filter((e) => (e.data || {}).kind === NON_RESEARCH).sort(byNewest);
  return { research, non };
}

export const displayNum = (x) => (x == null || x === '' ? '–' : String(x));

/* ---------- filters ---------- */
// Journal level, role and impact factor exist only on research publications, so while one of them is set,
// non-research entries drop out of the list.
export const emptyPubFilters = () => ({
  period: 'all', from: '', to: '', level: '', role: '', type: '', ifMin: '', ifMax: '', before: 'all', pub: 'all', home: 'all',
});

export function pubFilterCount(f) {
  let n = 0;
  for (const k of ['period', 'before', 'pub', 'home']) if (f[k] !== 'all') n += 1;
  for (const k of ['level', 'role', 'type', 'ifMin', 'ifMax']) if (String(f[k] ?? '').trim() !== '') n += 1;
  return n;
}

const num = (x) => (x === '' || x == null ? null : Number.isFinite(Number(x)) ? Number(x) : null);

export function matchesFilters(e, f, t) {
  const d = e.data || {};
  const [from, to] = periodRange(f, t);
  if ((from || to) && !overlaps(e, from, to)) return false;
  if (f.before === 'before' && !e.before_joining) return false;
  if (f.before === 'after' && e.before_joining) return false;
  if (f.pub === 'yes' && !e.is_public) return false;
  if (f.pub === 'no' && e.is_public) return false;
  if (f.home === 'yes' && !e.is_featured) return false;
  if (f.home === 'no' && e.is_featured) return false;
  if (f.type && d.type !== f.type && d.nr_type !== f.type) return false;
  const isResearch = d.kind === RESEARCH;
  if (f.level && !(isResearch && d.journal_level === f.level)) return false;
  if (f.role && !(isResearch && Array.isArray(d.roles) && d.roles.includes(f.role))) return false;
  const lo = num(f.ifMin);
  const hi = num(f.ifMax);
  if (lo !== null || hi !== null) {
    const v = num(d.impact_factor);
    if (!isResearch || v === null) return false;
    if (lo !== null && v < lo) return false;
    if (hi !== null && v > hi) return false;
  }
  return true;
}

// The choices for the Type filter: whatever types the saved entries use, research and non-research together.
export function typeOptions(rows) {
  const set = new Set();
  for (const e of rows) { const d = e.data || {}; if (d.type) set.add(d.type); if (d.nr_type) set.add(d.nr_type); }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/* ---------- sorting ---------- */
// sort = { key, dir } with dir 'asc' or 'desc', or null for the default newest-first order.
// Clicking a heading walks ascending, descending, then back to the default.
export function nextSort(cur, key) {
  if (!cur || cur.key !== key) return { key, dir: 'asc' };
  return cur.dir === 'asc' ? { key, dir: 'desc' } : null;
}

const sortValue = (e, key) => {
  const d = e.data || {};
  switch (key) {
    case 'year': return e.start_date || null;
    case 'title': return d.title ? String(d.title) : null;
    case 'journal': return d.journal_name ? String(d.journal_name) : null;
    case 'type': return d.nr_type ? String(d.nr_type) : null;
    case 'impact': return num(d.impact_factor);
    default: return null;
  }
};

// Blank values go last in both directions; ties fall back to the default order so the result is stable.
export function sortRows(rows, sort) {
  if (!sort) return rows.slice().sort(byNewest);
  const sign = sort.dir === 'desc' ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const x = sortValue(a, sort.key);
    const y = sortValue(b, sort.key);
    if (x === null && y === null) return byNewest(a, b);
    if (x === null) return 1;
    if (y === null) return -1;
    const c = typeof x === 'number' ? x - y : String(x).localeCompare(String(y), undefined, { sensitivity: 'base', numeric: true });
    return c ? sign * c : byNewest(a, b);
  });
}
