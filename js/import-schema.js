import { SECTIONS, SITE_PUBLIC, SITE_FEATURED, SITE_AREAS } from './sections.js';
import { personFields } from './team-data.js';

// What the Excel upload covers, and what each sheet is called.
// The sheet name is how the importer finds a section, so these names must stay stable.
// Policy, Achievements, Projects, Teams and One-page summaries are not here: they are entered in the app.
export const PEOPLE = 'people';
export const IMPORT_SECTIONS = [
  ['teaching', 'Teaching'],
  ['field_visit', 'Field visit'],
  ['training', 'Training'],
  ['meeting', 'Meeting'],
  ['support', 'Programme support'],
  ['peer_review', 'Peer review'],
  ['publication', 'Publication'],
  ['mentee', 'Mentee'],
  [PEOPLE, 'People'],
];

// Each research area becomes one Yes/No column on the Publication sheet. The column id is this prefix plus the area slug.
export const AREA_PREFIX = 'area__';

// People live in their own table, not in `entries`, so they get their own small definition.
// Its rules read a flat row (the shape of a people table row), where entries sections read row.data.
export const PEOPLE_DEF = {
  label: 'People',
  summary: (r) => [r.full_name, r.designation].filter(Boolean).join(', '),
  dupKey: (r) => [(r.full_name || '').toLowerCase().trim(), (r.designation || '').toLowerCase().trim()].join('|'),
};
export const defOf = (key) => (key === PEOPLE ? PEOPLE_DEF : SECTIONS[key]);

// Older records often lack some details, so the upload relaxes these fields. The entry forms stay as they are.
const RELAXED = { publication: ['summary'] };

// Short column titles and notes for the Yes/No columns, which have long labels on the entry forms.
const SHORT_LABEL = {
  is_public: 'Show on public website', is_featured: 'Feature on home page',
  public_consent: 'Mentee agreed to be named', photo_consent: 'Photo consent',
};
const YESNO_HELP = {
  is_public: 'Yes puts the record on the public website. Blank counts as No.',
  is_featured: 'Yes features it on the home page. It counts only when "Show on public website" is Yes. Blank counts as No.',
  public_consent: 'Yes only if the mentee agreed to be named on the website. Blank counts as No.',
  photo_consent: 'Yes only if the person agreed to show their photo. It applies only when a photo path is given. Blank counts as No.',
};

const resolveList = (f, lookups) => {
  const list = f.optionsFrom && lookups[f.optionsFrom];
  return list && list.length ? { ...f, options: list } : f;
};

// The research areas the upload offers: the database list when it is known, otherwise the built-in five.
const areaList = (lookups) => (lookups.research_areas && lookups.research_areas.length ? lookups.research_areas : SITE_AREAS.options);

function areaFields(lookups) {
  const areas = areaList(lookups);
  const keys = areas.map((a) => AREA_PREFIX + a.value);
  return areas.map((a, i) => ({
    key: AREA_PREFIX + a.value, slug: a.value, type: 'checkbox', label: `Area: ${a.label}`,
    help: 'Yes for each research area that applies. At least one area must be Yes. Blank counts as No.',
    check: i === 0 ? (_val, vals) => (keys.some((k) => vals[k] === true) ? '' : 'Enter Yes for at least one research area.') : undefined,
  }));
}

// Website columns that sit after a sheet's normal columns. They are table columns or data fields on the entry forms too.
function websiteFields(key, lookups) {
  if (key === 'publication') return [...areaFields(lookups), SITE_PUBLIC, SITE_FEATURED];
  if (key === 'mentee') {
    return [{ ...SITE_PUBLIC,
      check: (val, vals) => (val && !vals.public_consent ? 'Show on public website needs "Mentee agreed to be named" = Yes.' : '') }];
  }
  return [];
}

// The fields one sheet carries, in column order. The before-joining tick is never a column:
// the importer works it out from the date. `lookups` holds the database lists (research areas, mentee programmes).
export function importFields(key, lookups = {}) {
  const relaxed = RELAXED[key] || [];
  const base = key === PEOPLE ? personFields().filter((f) => f.key !== 'sort_order') : SECTIONS[key].fields;
  return [...base, ...websiteFields(key, lookups)].map((f) => {
    let out = relaxed.includes(f.key) ? { ...f, required: false } : f;
    out = resolveList(out, lookups);
    if (out.type === 'checkbox') out = { ...out, label: SHORT_LABEL[out.key] || out.label, help: YESNO_HELP[out.key] || out.help };
    return out;
  });
}

// Plain-words condition for a field that only applies to some rows, such as
// 'Fill only when "What was it?" = Programme support'. Returns '' when the field always applies.
export function whenHint(fields, f) {
  if (!f.showIf) return '';
  const ctrls = fields.filter((c) => c !== f && (c.type === 'select' || (c.type === 'multicheck' && c.options.length <= 6)));
  const cands = ctrls.map((c) => (c.type === 'select' ? [null, ...c.options] : [null, ...c.options.map((o) => [o])]));
  const seen = ctrls.map(() => new Set());
  const idx = ctrls.map(() => 0);
  let any = false;
  for (;;) {
    const vals = {};
    ctrls.forEach((c, i) => { vals[c.key] = cands[i][idx[i]]; });
    if (f.showIf(vals)) {
      any = true;
      ctrls.forEach((c, i) => { const v = vals[c.key]; if (v !== null) seen[i].add(Array.isArray(v) ? v[0] : v); });
    }
    let i = ctrls.length - 1;
    while (i >= 0 && ++idx[i] === cands[i].length) { idx[i] = 0; i--; }
    if (i < 0) break;
  }
  if (!any) return '';
  const parts = [];
  ctrls.forEach((c, i) => {
    if (seen[i].size === 0 || seen[i].size === c.options.length) return;   // this field does not narrow the condition
    const list = [...seen[i]].join(' or ');
    parts.push(c.type === 'select' ? `"${c.label}" = ${list}` : `"${c.label}" includes ${list}`);
  });
  return parts.length ? `Fill only when ${parts.join(' and ')}.` : '';
}

// 'Programme support' from 'Fill only when "What was it?" = Programme support and ...'
const firstCondition = (hint) => { const m = hint.match(/^Fill only when "[^"]+" (?:=|includes) (.+?)(?: and "|\.$)/); return m ? m[1] : ''; };

// Column titles for a sheet. A label that repeats on one sheet gets the row type added, so every column reads differently.
// title is what the header shows (with * or †); label is the same without the mark, for use in messages.
export function columnTitles(fields) {
  const counts = {};
  fields.forEach((f) => { counts[f.label] = (counts[f.label] || 0) + 1; });
  return fields.map((f) => {
    const hint = whenHint(fields, f);
    const label = counts[f.label] > 1 && firstCondition(hint) ? `${f.label} (${firstCondition(hint)})` : f.label;
    const conditional = !!hint || !!f.requiredIf;     // † only when the column depends on another answer
    const mark = (f.required || f.requiredIf) ? (conditional ? ' †' : ' *') : '';
    return { key: f.key, label, title: label + mark };
  });
}

// A short fingerprint of every sheet, column, type, requirement and dropdown value.
// It goes into the template, and the importer compares it, so an out-of-date template is caught.
export function schemaHash(lookups = {}) {
  const spec = IMPORT_SECTIONS.map(([key, sheet]) => [sheet, importFields(key, lookups).map((f) => [
    f.key, f.type, !!f.required, !!f.requiredIf, f.options || null, f.words || null, f.min ?? null,
  ])]);
  const s = JSON.stringify(spec);
  let hash = 0x811c9dc5;                                  // FNV-1a, 32 bit
  for (let i = 0; i < s.length; i++) { hash ^= s.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, '0');
}

export const TEMPLATE_VERSION = 'sp-import-2';

// Fixed layout of every data sheet. Row 1 (hidden) holds the column ids, row 2 the headers,
// row 3 a grey example that is ignored, and the records start in row 4.
export const LAYOUT = { keyRow: 1, headerRow: 2, exampleRow: 3, firstDataRow: 4, capacity: 1000 };
