import { today } from './dom.js';

// "Last completed" periods relative to a date, as agreed: FY runs 1 Apr to 31 Mar, CY runs 1 Jan to 31 Dec.
export function lastFY(t = today()) {
  const [y, m] = t.split('-').map(Number);
  const sy = m >= 4 ? y - 1 : y - 2;
  return [`${sy}-04-01`, `${sy + 1}-03-31`];
}
export function lastCY(t = today()) {
  const y = Number(t.slice(0, 4)) - 1;
  return [`${y}-01-01`, `${y}-12-31`];
}

// Does the entry touch [from, to]? Ongoing entries stay open-ended whatever end date they carry; otherwise a blank end date means a single day.
export function overlaps(e, from, to) {
  const s = e.start_date;
  if (!s) return false;
  const end = e.ongoing ? '9999-12-31' : (e.end_date || s);
  return (!to || s <= to) && (!from || end >= from);
}

export function facetValues(rows, key) {
  const set = new Set();
  for (const e of rows) {
    const v = (e.data || {})[key];
    if (Array.isArray(v)) v.forEach((x) => set.add(x)); else if (v) set.add(v);
  }
  return [...set].sort((a, b) => String(a).localeCompare(String(b)));
}

export function yearsIn(rows) {
  const set = new Set();
  for (const e of rows) if (e.start_date) set.add(e.start_date.slice(0, 4));
  return [...set].sort().reverse();
}

export function periodRange(f, t = today()) {
  if (f.period === 'fy') return lastFY(t);
  if (f.period === 'cy') return lastCY(t);
  if (/^\d{4}$/.test(f.period)) return [`${f.period}-01-01`, `${f.period}-12-31`];
  if (f.period === 'custom') return [f.from || null, f.to || null];
  return [null, null];
}

export function applyFilters(rows, f, summaryOf, t = today()) {
  const [from, to] = periodRange(f, t);
  const q = (f.q || '').trim().toLowerCase();
  let out = rows.filter((e) => {
    if ((from || to) && !overlaps(e, from, to)) return false;
    if (q && !(summaryOf(e) + ' ' + JSON.stringify(e.data || {})).toLowerCase().includes(q)) return false;
    if (f.before === 'before' && !e.before_joining) return false;
    if (f.before === 'after' && e.before_joining) return false;
    for (const [k, val] of Object.entries(f.facets || {})) {
      if (!val) continue;
      const v = (e.data || {})[k];
      if (!(Array.isArray(v) ? v.includes(val) : v === val)) return false;
    }
    return true;
  });
  out = out.slice().sort((a, b) => {
    const c = (a.start_date || '') < (b.start_date || '') ? -1 : (a.start_date || '') > (b.start_date || '') ? 1 : 0;
    return f.sort === 'asc' ? c : -c;
  });
  return out;
}

export const isFiltered = (f) => !!((f.q || '').trim() || f.period !== 'all' || f.before !== 'all' || Object.values(f.facets || {}).some(Boolean));
