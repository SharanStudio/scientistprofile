import { SECTIONS } from './sections.js';

// What the Excel upload covers, and what each sheet is called.
// The sheet name is how the importer finds a section, so these names must stay stable.
export const IMPORT_SECTIONS = [
  ['teaching', 'Teaching'],
  ['field_visit', 'Field visit'],
  ['training', 'Training'],
  ['meeting', 'Meeting'],
  ['support', 'Programme support'],
  ['policy', 'Policy'],
  ['peer_review', 'Peer review'],
  ['publication', 'Publication'],
];

// Older records often lack some details, so the upload relaxes these fields. The entry forms stay as they are.
const RELAXED = { publication: ['summary'] };

// The fields one sheet carries, in column order. The before-joining tick is never a column:
// the importer works it out from the date.
export function importFields(key) {
  const relaxed = RELAXED[key] || [];
  return SECTIONS[key].fields.map((f) => (relaxed.includes(f.key) ? { ...f, required: false } : f));
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
export function schemaHash() {
  const spec = IMPORT_SECTIONS.map(([key, sheet]) => [sheet, importFields(key).map((f) => [
    f.key, f.type, !!f.required, !!f.requiredIf, f.options || null, f.words || null, f.min ?? null,
  ])]);
  const s = JSON.stringify(spec);
  let hash = 0x811c9dc5;                                  // FNV-1a, 32 bit
  for (let i = 0; i < s.length; i++) { hash ^= s.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; }
  return hash.toString(16).padStart(8, '0');
}

export const TEMPLATE_VERSION = 'sp-import-1';

// Fixed layout of every data sheet. Row 1 (hidden) holds the column ids, row 2 the headers,
// row 3 a grey example that is ignored, and the records start in row 4.
export const LAYOUT = { keyRow: 1, headerRow: 2, exampleRow: 3, firstDataRow: 4, capacity: 1000 };
