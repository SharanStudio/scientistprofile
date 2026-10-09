import { today } from './dom.js';

// Pure rules shared by the entry forms and the Excel upload. Nothing here touches the page,
// so the same checks run on a typed form and on an uploaded row.

export const MIN_DATE = '1950-01-01';
const ORCID_RE = /^(?:https?:\/\/orcid\.org\/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$/;

export const wordCount = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

// ORCID check digit (ISO 7064 mod 11-2)
function orcidOk(id) {
  const digits = id.replace(/-/g, '');
  let total = 0;
  for (let i = 0; i < 15; i++) total = (total + Number(digits[i])) * 2;
  const r = (12 - (total % 11)) % 11;
  return digits[15] === (r === 10 ? 'X' : String(r));
}

// A field shows only when its showIf passes. Hidden fields are never required and never saved.
export const isVisible = (f, vals) => !f.showIf || !!f.showIf(vals);

// What gets saved. Hidden fields return null/false so stale answers never reach the database.
// `raw` maps each field key to its entered value (null when empty).
export function cleanValues(fields, raw) {
  const out = {};
  for (const f of fields) {
    if (!isVisible(f, raw)) { out[f.key] = f.type === 'checkbox' ? false : null; continue; }
    const val = raw[f.key];
    out[f.key] = val !== null && f.norm ? f.norm(val) : val;
  }
  return out;
}

// Checks every field. Returns { fieldKey: message } and leaves out fields that pass.
// `vals` holds the raw (not yet normalised) values; empty means null.
export function validateValues(fields, vals) {
  const errors = {};
  for (const f of fields) {
    let msg = '';
    const val = vals[f.key];
    const empty = val === null || val === '' || val === undefined;
    if (isVisible(f, vals)) {
      if ((f.required || (f.requiredIf && f.requiredIf(vals))) && empty) msg = f.type === 'multicheck' || f.type === 'select' ? 'Choose an option.' : 'This field is required.';
      else if (!empty) {
        if (f.type === 'date') {
          if (val < MIN_DATE) msg = 'Check the year. This date is too early.';
          else if (f.noFuture && val > today()) msg = 'This date is in the future.';
        }
        if (f.type === 'url' && !/^https?:\/\/\S+\.\S+/i.test(val)) msg = 'Enter a full link starting with https://';
        if (f.type === 'orcid') {
          const m = ORCID_RE.exec(val);
          if (!m) msg = 'Use the format 0000-0002-1825-0097.';
          else if (!orcidOk(m[1])) msg = 'This ORCID fails its check digit. Re-check the digits.';
        }
        if (f.type === 'int' && (!Number.isInteger(val) || val < (f.min ?? 0))) msg = f.min > 0 ? `Enter a whole number, ${f.min} or more.` : 'Enter a whole number, zero or more.';
        if (f.type === 'num' && (!Number.isFinite(val) || val < 0 || val > (f.maxNum ?? 1000))) msg = 'Enter a number such as 4.2.';
        if (f.pattern && typeof val === 'string' && !f.pattern.test(val)) msg = f.patternMsg || 'Check the format.';
        if (f.words && typeof val === 'string' && wordCount(val) > f.words) msg = `Keep this to ${f.words} words or fewer.`;
        if (f.check && !msg) msg = f.check(val, vals) || '';
      }
    }
    if (msg) errors[f.key] = msg;
  }
  // The end date overrides any other message on that field, as the form always did.
  const sf = fields.find((f) => f.key === 'start_date');
  const ef = fields.find((f) => f.key === 'end_date');
  if (sf && ef && isVisible(ef, vals) && vals.start_date && vals.end_date && vals.end_date < vals.start_date) {
    errors.end_date = 'End date cannot be before the start date.';
  }
  return errors;
}

// Turns a section's saved values into the database row. Used by the form and by the upload.
export function buildRow(key, sec, v) {
  const { start_date, end_date, before_joining, ...rest } = v;
  const data = sec.finalise ? sec.finalise(rest) : rest;
  return {
    section: key, start_date, end_date: end_date || null,
    ongoing: sec.ongoingFrom ? !!sec.ongoingFrom(data) : (!!sec.ongoingIfBlank && !end_date),
    before_joining: !!before_joining, data,
  };
}
