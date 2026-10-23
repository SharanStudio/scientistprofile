// Pure helpers for the Publications page. No DOM and no database here, so they run in Node tests too.
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
  const hay = [d.title, d.journal_name, d.citation, d.type, d.nr_type, d.doi, yearOf(e), areasText(e, areas)]
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
