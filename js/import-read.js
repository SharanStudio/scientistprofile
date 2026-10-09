import { SECTIONS } from './sections.js';
import { IMPORT_SECTIONS, LAYOUT, TEMPLATE_VERSION, columnTitles, importFields, schemaHash } from './import-schema.js';
import { buildRow, cleanValues, isVisible, validateValues } from './rules.js';

// Reads a filled upload workbook and checks every row with the same rules the entry forms use.
// Nothing here touches the page or the database, so the whole path can be tested on its own.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS_PER_SHEET = 5000;
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const DATE_HELP = 'Write the date as dd-mmm-yyyy, for example 15-Sep-2021.';

/* ---------- cells ---------- */

// Reduces whatever ExcelJS hands back (text, number, date, rich text, formula, link, error) to a plain value.
export function plainCell(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (v.error !== undefined) return { error: String(v.error) };
    if (Array.isArray(v.richText)) return plainCell(v.richText.map((t) => t.text).join(''));
    if ('result' in v) return plainCell(v.result);
    if ('text' in v) return plainCell(v.text);
    if ('hyperlink' in v) return plainCell(v.hyperlink);
    return { error: 'unreadable' };
  }
  if (typeof v === 'string') { const t = v.replace(/ /g, ' ').trim(); return t === '' ? null : t; }
  return v;
}

const pad = (n) => String(n).padStart(2, '0');
function isoOf(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;   // rejects 31-Feb
  return `${y}-${pad(m)}-${pad(d)}`;
}

// Date cells arrive as real dates, as Excel serial numbers, or as typed text (dd-mmm-yyyy or yyyy-mm-dd).
export function parseDate(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? { error: DATE_HELP } : { value: v.toISOString().slice(0, 10) };
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v < 1 || v > 80000) return { error: DATE_HELP };
    return { value: new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10) };
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) { const iso = isoOf(+m[1], +m[2], +m[3]); return iso ? { value: iso } : { error: `"${s}" is not a real date. ${DATE_HELP}` }; }
  m = s.match(/^(\d{1,2})[-\s]+([A-Za-z]{3,9})\.?[-\s,]+(\d{4})$/);
  if (m) {
    const name = m[2].toLowerCase();
    const mi = MONTHS.findIndex((mo) => mo.startsWith(name) && name.length >= 3);
    const iso = mi >= 0 ? isoOf(+m[3], mi + 1, +m[1]) : null;
    if (iso) return { value: iso };
    return { error: `"${s}" is not a real date. ${DATE_HELP}` };
  }
  return { error: `"${s}" is not a date I can read. ${DATE_HELP}` };
}

/* ---------- dropdown values ---------- */

const norm = (s) => String(s).toLowerCase().replace(/&/g, 'and').replace(/\s+/g, ' ').trim();

function editDistance(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return dp[a.length][b.length];
}

function closest(value, options) {
  const n = norm(value);
  let best = null; let bestD = Infinity;
  for (const o of options) { const d = editDistance(n, norm(o)); if (d < bestD) { best = o; bestD = d; } }
  return best !== null && bestD <= Math.max(2, Math.floor(n.length / 4)) ? best : null;
}

function matchOption(value, options) {
  const n = norm(value);
  const hit = options.find((o) => norm(o) === n);
  if (hit) return { value: hit };
  const near = closest(value, options);
  const where = options.length <= 12 ? `Choose one of: ${options.join(' / ')}.` : 'Use a name from the dropdown (the Lists sheet shows them all).';
  return { error: `"${value}" is not an allowed value.${near ? ` Did you mean "${near}"?` : ''} ${where}` };
}

/* ---------- one cell, by field type ---------- */

// Returns { value } (null when empty) or { error }. The rules in rules.js then judge the value itself.
export function convertCell(f, c) {
  if (c === null) return { value: null };
  if (c && c.error) return { error: `The cell holds an error value (${c.error}). Replace it with the right entry.` };
  switch (f.type) {
    case 'date': return parseDate(c);
    case 'int': {
      if (typeof c === 'number') return { value: c };
      if (typeof c === 'string' && /^\d+$/.test(c.replace(/[\s,]/g, ''))) return { value: Number(c.replace(/[\s,]/g, '')) };
      return { error: 'Enter a whole number.' };
    }
    case 'num': {
      if (typeof c === 'number') return { value: c };
      if (typeof c === 'string' && /^\d+(\.\d+)?$/.test(c)) return { value: Number(c) };
      return { error: 'Enter a number such as 4.2.' };
    }
    case 'select': return matchOption(typeof c === 'string' ? c : String(c), f.options);
    case 'multicheck': {
      const tokens = String(c).split(/[;\n]+/).map((t) => t.trim()).filter(Boolean);
      const out = [];
      for (const t of tokens) {
        const r = matchOption(t, f.options);
        if (r.error) return { error: t.includes(',') ? `${r.error} Separate several values with a semicolon (;), not a comma.` : r.error };
        if (!out.includes(r.value)) out.push(r.value);
      }
      return { value: out.length ? out : null };
    }
    default: {   // text, textarea, url, orcid
      if (c instanceof Date) return { error: 'This column takes text, but the cell holds a date.' };
      if (typeof c === 'boolean') return { error: 'This column takes text, but the cell holds TRUE/FALSE.' };
      const text = String(c).trim();
      if (f.max && text.length > f.max) return { error: `Too long: ${text.length} characters, the limit is ${f.max}.` };
      return { value: text };
    }
  }
}

// Wording that fits a spreadsheet cell better than a form field.
function cellMessage(msg, f) {
  if (msg === 'This field is required.') return 'Required, but the cell is empty.';
  if (msg === 'Choose an option.') return f.type === 'multicheck' ? 'Required. Enter at least one value, separated by semicolons.' : 'Required. Pick a value from the dropdown.';
  return msg;
}

/* ---------- the workbook ---------- */

export async function loadWorkbook(ExcelJS, buffer) {
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch (e) {
    throw new Error('This file could not be read as an Excel workbook. Save it as an .xlsx file (Excel Workbook) and choose it again.');
  }
  return wb;
}

// Finds the sheets and column ids. Problems stop the read; nothing is guessed.
export function readSheets(wb) {
  const problems = [];
  const meta = wb.getWorksheet('_meta');
  if (!meta) return { fatal: true, problems: ['This workbook does not look like the Scientist Profile template. Download the template with the Template link and fill that file.'], sheets: [] };
  if (plainCell(meta.getCell('B1').value) !== TEMPLATE_VERSION || plainCell(meta.getCell('B2').value) !== schemaHash()) {
    return { fatal: true, problems: ['This workbook comes from an older or different version of the template. Download a fresh template with the Template link and copy your rows into it.'], sheets: [] };
  }
  const sheets = [];
  for (const [key, name] of IMPORT_SECTIONS) {
    const ws = wb.getWorksheet(name);
    if (!ws) { problems.push(`The sheet "${name}" is missing. Do not delete or rename sheets.`); continue; }
    const fields = importFields(key);
    const col = {};
    for (let i = 1; i <= ws.columnCount; i++) {
      const id = plainCell(ws.getRow(LAYOUT.keyRow).getCell(i).value);
      if (id) col[id] = i;
    }
    const want = fields.map((f) => f.key);
    if (Object.keys(col).length !== want.length || want.some((k) => !col[k])) {
      problems.push(`The columns on the sheet "${name}" were changed. Do not move, add or delete columns, and do not delete the hidden first row.`);
      continue;
    }
    if (ws.rowCount > LAYOUT.firstDataRow - 1 + MAX_ROWS_PER_SHEET) {
      problems.push(`The sheet "${name}" has more than ${MAX_ROWS_PER_SHEET} rows. Upload it in smaller files.`);
      continue;
    }
    const rows = [];
    for (let r = LAYOUT.firstDataRow; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells = {}; let any = false;
      for (const f of fields) { const v = plainCell(row.getCell(col[f.key]).value); cells[f.key] = v; if (v !== null) any = true; }
      if (any) rows.push({ rowNumber: r, cells });
    }
    sheets.push({ key, name, fields, rows });
  }
  return { fatal: false, problems, sheets };
}

/* ---------- checking ---------- */

// parsed: output of readSheets. ctx.joining: joining date (YYYY-MM-DD) or null.
// ctx.existing: the signed-in user's saved entries [{ section, start_date, data }], used to spot repeats.
export function checkSheets(parsed, ctx = {}) {
  const { joining = null, existing = [] } = ctx;
  const have = {};
  for (const e of existing) {
    const sec = SECTIONS[e.section];
    if (sec && sec.dupKey) (have[e.section] ||= new Set()).add(sec.dupKey(e));
  }
  const notes = [];
  let noJoining = false;
  const out = [];

  for (const sh of parsed.sheets) {
    const sec = SECTIONS[sh.key];
    const titles = columnTitles(sh.fields);
    const label = Object.fromEntries(titles.map((t) => [t.key, t.label]));
    const seen = new Map();
    const counts = { new: 0, exists: 0, 'dup-in-file': 0, error: 0 };
    const rows = [];

    for (const r of sh.rows) {
      const raw = {}; const conv = {};
      for (const f of sh.fields) {
        const res = convertCell(f, r.cells[f.key]);
        raw[f.key] = res.value ?? null;
        if (res.error) conv[f.key] = res.error;
      }
      const rules = validateValues(sh.fields, raw);
      const errors = [];
      for (const f of sh.fields) {
        const msg = conv[f.key] || (rules[f.key] ? cellMessage(rules[f.key], f) : '');
        if (msg) errors.push({ key: f.key, column: label[f.key], message: msg });
      }
      const warnings = sh.fields
        .filter((f) => !conv[f.key] && raw[f.key] !== null && !isVisible(f, raw))
        .map((f) => ({ key: f.key, column: label[f.key], message: 'Ignored, because it does not apply to this row.' }));

      const res = { rowNumber: r.rowNumber, status: 'new', errors, warnings, row: null, summary: '', of: null };
      if (errors.length) { res.status = 'error'; counts.error++; rows.push(res); continue; }

      const values = cleanValues(sh.fields, raw);
      let beforeJoining = false;
      if (sec.beforeJoining) {
        if (!joining) noJoining = true;
        else beforeJoining = !!values.start_date && values.start_date < joining;
      }
      res.row = buildRow(sh.key, sec, { ...values, before_joining: beforeJoining });
      try { res.summary = sec.summary(res.row); } catch (e) { res.summary = ''; }

      const k = sec.dupKey ? sec.dupKey(res.row) : null;
      if (k !== null && seen.has(k)) { res.status = 'dup-in-file'; res.of = seen.get(k); }
      else {
        if (k !== null) seen.set(k, r.rowNumber);
        if (k !== null && have[sh.key] && have[sh.key].has(k)) res.status = 'exists';
      }
      counts[res.status]++;
      rows.push(res);
    }
    out.push({ key: sh.key, name: sh.name, label: sec.label, counts, rows, total: rows.length });
  }

  if (noJoining) notes.push('Your profile has no joining date, so no Peer review or Publication row is tagged "before joining". Add the date in your profile and check the file again.');
  const totals = { rows: 0, new: 0, exists: 0, 'dup-in-file': 0, error: 0 };
  for (const s of out) { totals.rows += s.total; for (const k of ['new', 'exists', 'dup-in-file', 'error']) totals[k] += s.counts[k]; }
  return { fileProblems: parsed.problems, fatal: parsed.fatal, sheets: out, totals, notes };
}

// The whole read-and-check in one call.
export async function analyseFile(ExcelJS, buffer, ctx) {
  const wb = await loadWorkbook(ExcelJS, buffer);
  return checkSheets(readSheets(wb), ctx);
}
