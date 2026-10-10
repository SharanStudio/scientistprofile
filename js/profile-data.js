// Turns your saved entries and profile into the rows that go into the Scientist Profile Word file.
// Pure functions only (no browser or database calls), so they can be tested in Node.

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export const fmtDate = (s) => (s ? String(s).slice(0, 10).split('-').reverse().join('/') : '');

/* ---------- reporting windows ---------- */
// "Last financial year" = the most recent completed April–March year before the as-of date.
// "Last calendar year" = the previous January–December.
export function windows(asOf) {
  const [y, m] = asOf.split('-').map(Number);
  const fy0 = m >= 4 ? y - 1 : y - 2;
  return {
    asOf,
    fy: { start: iso(fy0, 4, 1), end: iso(fy0 + 1, 3, 31), label: `${fy0}-${String(fy0 + 1).slice(2)}` },
    cy: { start: iso(y - 1, 1, 1), end: iso(y - 1, 12, 31), label: String(y - 1) },
  };
}
const inWin = (date, w) => !!date && date >= w.start && date <= w.end;
// An entry counts in a window when any day of it falls inside. Ongoing entries run up to the as-of date.
function overlaps(e, w, asOf) {
  const s = e.start_date;
  if (!s) return false;
  const end = e.ongoing ? asOf : (e.end_date || s);
  return s <= w.end && end >= w.start;
}
const yn = (b) => (b ? 'Yes' : 'No');

/* ---------- helpers ---------- */
// Indian digit grouping (12,34,567) without depending on the browser's locale data
export function inr(v) {
  const n = String(v == null ? '' : v).replace(/\D/g, '');
  if (!n) return '';
  const last3 = n.slice(-3);
  const rest = n.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `₹ ${rest ? `${rest},` : ''}${last3}`;
}
const str = (v) => (v == null ? '' : String(v).trim());
const byDateDesc = (a, b) => (a.start_date < b.start_date ? 1 : a.start_date > b.start_date ? -1 : 0);
const range = (e) => (e.end_date && e.end_date !== e.start_date ? `${fmtDate(e.start_date)}–${fmtDate(e.end_date)}` : fmtDate(e.start_date));
const rolesText = (roles) => {
  const r = roles || [];
  if (r.includes('First author') && r.includes('Corresponding author')) return 'Both';
  return r.join(', ');
};
const supportTypes = (d) => (d.support_types || []).map((t) => (t === 'Other' ? str(d.support_other) || 'Other' : t)).join(', ');

/* ---------- the model ---------- */
// entries: rows of the entries table. profile: the profiles row. Returns everything the Word filler needs.
export function buildModel(entries, profile, asOf) {
  const win = windows(asOf);
  const p = profile || {};
  const of = (section) => entries.filter((e) => e.section === section).map((e) => ({ ...e, data: e.data || {} })).sort(byDateDesc);
  const flags = (e) => [yn(overlaps(e, win.fy, asOf)), yn(overlaps(e, win.cy, asOf))];
  const numbered = (list, cols) => list.map((e, i) => [String(i + 1), ...cols(e)]);

  const projects = of('project');
  const pi = projects.filter((e) => e.data.role === 'PI / joint PI');
  const coi = projects.filter((e) => e.data.role === 'Co-investigator');
  // "Ongoing and new": still running, or started inside the last financial or calendar year.
  const listed = (e) => e.data.status === 'Ongoing' || (e.data.status == null && e.ongoing)
    || inWin(e.start_date, win.fy) || inWin(e.start_date, win.cy);
  const projRow = (e, withCy) => {
    const d = e.data;
    const row = [str(d.name), str(d.type), str(d.collab), str(d.area_name || d.area), yn(inWin(e.start_date, win.fy)),
      yn(inWin(e.start_date, win.cy)), str(d.multi), str(d.funder), inr(d.total), ''];
    if (withCy) row.push('');
    return row;
  };

  const pubs = of('publication');
  const research = pubs.filter((e) => e.data.kind === 'Research publication');
  const nonResearch = pubs.filter((e) => e.data.kind === 'Non-research publication');
  const sinceJoin = (e) => !e.before_joining;
  const pubFlags = (e) => [yn(inWin(e.start_date, win.fy)), yn(inWin(e.start_date, win.cy))];

  const reviews = of('peer_review');
  const counts = (list) => [list.length, list.filter(sinceJoin).length,
    list.filter((e) => inWin(e.start_date, win.fy)).length, list.filter((e) => inWin(e.start_date, win.cy)).length];
  const editor = counts(reviews.filter((e) => e.data.role === 'Academic editor'));
  const reviewer = counts(reviews.filter((e) => e.data.role === 'Reviewer'));
  const reviewTotal = editor.map((n, i) => n + reviewer[i]);
  const rAll = counts(research);
  const rPub = counts(research.filter((e) => e.data.in_pubmed === 'Yes'));
  const nrAll = counts(nonResearch);
  const pubTotal = rAll.map((n, i) => n + nrAll[i]);

  const services = of('service');
  const supports = of('support');
  const meetings = of('meeting');
  const nil = (list) => (list.length ? '' : 'NIL');
  const val = services.filter((e) => e.data.kind === 'Validation of technology');
  const dx = services.filter((e) => e.data.kind === 'Diagnostics');
  const cs = services.filter((e) => e.data.kind === 'Clinical support');
  const innov = of('innovation');

  const tables = [
    /* 0 */ of('recognition').map((e) => [str(e.data.details), ...flags(e)]),
    /* 1 */ pi.filter(listed).map((e) => projRow(e, false)),
    /* 2 */ coi.filter(listed).map((e) => projRow(e, true)),
    /* 3 */ research.filter(sinceJoin).map((e, i) => {
      const d = e.data;
      return [String(i + 1), str(d.citation), rolesText(d.roles), str(d.journal_level), str(d.in_pubmed), str(d.pubid), str(d.doi),
        d.impact_factor == null ? '' : String(d.impact_factor), str(d.link), str(d.type), ...pubFlags(e), str(d.summary)];
    }),
    /* 4 */ null, /* 5 */ null, // count tables, filled below
    /* 6 */ of('notable').map((e) => [str(e.data.details), ...flags(e)]),
    /* 7 */ numbered(val, (e) => [str(e.data.tech_name), str(e.data.tech_area), str(e.data.firm), ...flags(e)]),
    /* 8 */ numbered(dx, (e) => [str(e.data.dx_condition), str(e.data.dx_test), String(e.data.dx_samples ?? ''), ...flags(e)]),
    /* 9 */ numbered(cs, (e) => [str(e.data.cs_condition), str(e.data.cs_support), String(e.data.cs_patients ?? ''), ...flags(e)]),
    /* 10 */ numbered(supports.filter((e) => e.data.kind === 'Programme support'), (e) => {
      const d = e.data;
      return [str(d.name), d.level === 'National' ? 'National' : `State: ${str(d.where)}`, supportTypes(d), ...flags(e)];
    }),
    /* 11 */ numbered(supports.filter((e) => e.data.kind === 'Outbreak / emergency role'), (e) => {
      const d = e.data;
      return [str(d.name), str(d.level), d.role_type === 'Others' ? str(d.role_other) : str(d.role_type), ...flags(e)];
    }),
    /* 12 */ numbered(of('policy'), (e) => [str(e.data.type), str(e.data.title), str(e.data.level), str(e.data.impact), ...flags(e)]),
    /* 13 */ numbered(innov, (e) => [str(e.data.name), str(e.data.area), str(e.data.patent), str(e.data.tech), ...flags(e)]),
    /* 14 */ numbered(of('training'), (e) => [str(e.data.title), str(e.data.type), str(e.data.level), String(e.data.participants ?? ''), ...flags(e)]),
    // Only real awards go into the Word table. Grants, invited talks and roles are logged here for the website only.
    /* 15 */ numbered(of('award').filter((e) => !e.data.category || e.data.category === 'Award'), (e) => [str(e.data.name), str(e.data.level), ...flags(e)]),
    /* 16 */ of('teaching').map((e) => [`${fmtDate(e.start_date)}, ${str(e.data.topic)} – ${str(e.data.course)}`, ...flags(e)]),
    /* 17 */ of('field_visit').map((e) => {
      const d = e.data;
      return [`${range(e)}, ${str(d.project)}, ${str(d.district)}, ${str(d.state)} – ${str(d.purpose)}`, ...flags(e)];
    }),
    /* 18 */ meetings.filter((e) => e.data.kind === 'Committee meeting').map((e) => [`${fmtDate(e.start_date)}, ${str(e.data.name)}`, ...flags(e)]),
    /* 19 */ meetings.filter((e) => e.data.kind === 'Interview meeting').map((e) => [`${fmtDate(e.start_date)}, ${str(e.data.name)}`, ...flags(e)]),
  ];

  const num = (a) => a.map(String);
  const header = {
    date_updated: fmtDate(asOf),
    full_name: str(p.full_name), degrees: str(p.degrees), designation: str(p.designation), division: str(p.division),
    gender: str(p.gender), dob: fmtDate(p.dob), scholar_link: str(p.scholar_link), orcid: str(p.orcid), other_links: str(p.other_links),
    i10_index: p.i10_index == null ? '' : String(p.i10_index), h_index: p.h_index == null ? '' : String(p.h_index),
    academic_editor: str(p.academic_editor_journals),
    scholar_updated: yn(!!p.scholar_updated), orcid_updated: yn(!!p.orcid_updated),
    nonresearch_count: nonResearch.length ? String(nonResearch.length) : 'NIL',
    nil_validation: nil(val), nil_diagnostics: nil(dx), nil_clinical: nil(cs), innovation_tail: nil(innov),
  };

  return {
    win, header, tables,
    countTables: {
      4: [num(editor), num(reviewer), num(reviewTotal)],
      5: [num(rAll), num(rPub), num(nrAll), num(pubTotal)],
    },
    nonResearch: nonResearch.map((e) => str(e.data.citation)),
    stats: { entries: entries.length, research: research.length, nonResearch: nonResearch.length, projects: pi.length + coi.length },
  };
}

/* ---------- readiness check shown before building ---------- */
export function readiness(entries, profile) {
  const warn = [];
  const p = profile || {};
  if (!p.full_name) warn.push('Your profile has no full name.');
  if (!p.joining_date) warn.push('Your profile has no joining date, so "since joining" counts may be wrong.');
  const pubs = entries.filter((e) => e.section === 'publication' && e.data && e.data.kind === 'Research publication');
  const noSummary = pubs.filter((e) => !str(e.data.summary)).length;
  if (noSummary) warn.push(`${noSummary} research publication${noSummary === 1 ? ' has' : 's have'} no short summary.`);
  return warn;
}
