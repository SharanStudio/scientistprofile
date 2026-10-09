import { h } from './dom.js';
import { IMPORT_SECTIONS } from './import-schema.js';
import { MAX_FILE_BYTES } from './import-read.js';
import { loadExcelJS } from './exceljs-loader.js';

// The Upload page. The file is read in this browser tab only. It is never sent anywhere or stored.
const SHOW_LIMIT = 200;   // longest error list drawn on screen
const keys = IMPORT_SECTIONS.map((s) => s[0]);

// The user's existing records, needed to spot "already exists". Read page by page.
async function loadExisting(sb) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('entries').select('section,start_date,end_date,data')
      .in('section', keys).order('id').range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) break;
  }
  return out;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function totalsTable(res) {
  const head = h('tr', {}, ['Sheet', 'Rows', 'New', 'Exist', 'Repeat', 'Error'].map((t) => h('th', { scope: 'col' }, t)));
  const body = res.sheets.map((s) => h('tr', {}, h('th', { scope: 'row' }, s.name), h('td', {}, s.total),
    h('td', {}, s.counts.new), h('td', {}, s.counts.exists), h('td', {}, s.counts['dup-in-file']),
    h('td', { class: s.counts.error ? 'bad' : '' }, s.counts.error)));
  const t = res.totals;
  const foot = h('tr', { class: 'total' }, h('th', { scope: 'row' }, 'All sheets'), h('td', {}, t.rows), h('td', {}, t.new),
    h('td', {}, t.exists), h('td', {}, t['dup-in-file']), h('td', { class: t.error ? 'bad' : '' }, t.error));
  return h('div', { class: 'tablewrap' }, h('p', { class: 'hint' }, 'Exist = already in your profile (skipped). Repeat = repeated in this file (skipped).'), h('table', { class: 'results' }, h('thead', {}, head), h('tbody', {}, body, foot)));
}

function errorList(res) {
  const items = [];
  for (const s of res.sheets) for (const r of s.rows) for (const e of r.errors) items.push({ sheet: s.name, row: r.rowNumber, ...e });
  if (!items.length) return null;
  const shown = items.slice(0, SHOW_LIMIT);
  return h('section', { class: 'tile' },
    h('h2', {}, plural(items.length, 'error')),
    h('p', { class: 'hint' }, 'Fix these in your Excel file, save it, and upload it again. Nothing has been saved.'),
    h('ul', { class: 'errlist' }, shown.map((e) => h('li', {}, h('strong', {}, `${e.sheet}, row ${e.row}`), ` · ${e.column}: ${e.message}`))),
    items.length > shown.length ? h('p', { class: 'hint' }, `Showing the first ${SHOW_LIMIT}. Fix these and upload again to see the rest.`) : null);
}

function noteList(res) {
  const warns = [];
  for (const s of res.sheets) for (const r of s.rows) for (const w of r.warnings) warns.push(`${s.name}, row ${r.rowNumber} · ${w.column}: ${w.message}`);
  if (!warns.length && !res.notes.length) return null;
  const shown = warns.slice(0, SHOW_LIMIT);
  return h('section', { class: 'tile' }, h('h2', {}, 'Notes'),
    h('ul', { class: 'errlist' }, res.notes.map((n) => h('li', {}, n)), shown.map((w) => h('li', {}, w))),
    warns.length > shown.length ? h('p', { class: 'hint' }, `Plus ${warns.length - shown.length} more notes.`) : null);
}

function previewNew(res) {
  const blocks = res.sheets.filter((s) => s.counts.new).map((s) => {
    const rows = s.rows.filter((r) => r.status === 'new');
    return h('details', {}, h('summary', {}, `${s.label}: ${plural(rows.length, 'new record')}`),
      h('ul', { class: 'errlist' }, rows.slice(0, SHOW_LIMIT).map((r) => h('li', {},
        `Row ${r.rowNumber} · ${r.row.start_date}${r.summary ? ` · ${r.summary}` : ''} `,
        r.row.before_joining ? h('span', { class: 'tag' }, 'Before joining') : null))));
  });
  if (!blocks.length) return null;
  return h('section', { class: 'tile' }, h('h2', {}, 'Records that would be added'), blocks);
}

function skipped(res) {
  const lines = [];
  for (const s of res.sheets) for (const r of s.rows) {
    if (r.status === 'exists') lines.push(`${s.name}, row ${r.rowNumber} · already in your profile: ${r.summary || r.row.start_date}`);
    if (r.status === 'dup-in-file') lines.push(`${s.name}, row ${r.rowNumber} · repeats row ${r.of} in this file: ${r.summary || r.row.start_date}`);
  }
  if (!lines.length) return null;
  return h('details', { class: 'tile' }, h('summary', {}, `${plural(lines.length, 'row')} would be skipped`),
    h('ul', { class: 'errlist' }, lines.slice(0, SHOW_LIMIT).map((l) => h('li', {}, l))));
}

export async function viewImport(ctx) {
  const { sb, shell, friendly, state } = ctx;
  const out = h('div', {});
  const input = h('input', { type: 'file', id: 'xl', accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

  async function pick() {
    const file = input.files[0];
    if (!file) return;
    out.replaceChildren(h('p', {}, 'Reading and checking your file…'));
    try {
      if (!/\.xlsx$/i.test(file.name)) throw new Error('Choose an Excel file that ends in .xlsx. Use the Template link in the header to get the right one.');
      if (file.size > MAX_FILE_BYTES) throw new Error(`This file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1048576} MB.`);
      const [ExcelJS, mod] = await Promise.all([loadExcelJS(), import('./import-read.js')]);
      const buffer = await file.arrayBuffer();
      const existing = await loadExisting(sb);
      const res = await mod.analyseFile(ExcelJS, buffer, { joining: state.profile && state.profile.joining_date, existing });
      out.replaceChildren(...show(res, file.name).filter(Boolean));
    } catch (e) {
      out.replaceChildren(h('div', { class: 'flash error', role: 'alert' }, friendly(e)));
    }
  }
  input.addEventListener('change', pick);

  function show(res, name) {
    if (res.fatal) return [h('div', { class: 'flash error', role: 'alert' }, res.fileProblems.join(' '))];
    const problems = res.fileProblems.length ? h('div', { class: 'flash warn', role: 'alert' }, res.fileProblems.map((p) => h('div', {}, p))) : null;
    const t = res.totals;
    const verdict = t.rows === 0 ? h('div', { class: 'flash warn' }, 'The file has no records. Fill in the sheets from row 4 and upload again.')
      : t.error ? h('div', { class: 'flash error' }, `${plural(t.error, 'row')} ${t.error === 1 ? 'needs' : 'need'} fixing before anything can be imported.`)
      : t.new === 0 ? h('div', { class: 'flash warn' }, 'Every row already exists, so there is nothing new to add.')
      : h('div', { class: 'flash ok' }, `Ready: ${plural(t.new, 'new record')} can be added.`);
    return [h('p', { class: 'hint' }, `Checked ${name}. The file stays on your device.`), verdict, problems, totalsTable(res), errorList(res), noteList(res), previewNew(res), skipped(res),
      h('div', { class: 'actions' }, h('button', { class: 'primary', disabled: true, title: 'Saving arrives in the next update' }, 'Import'),
        h('span', { class: 'hint' }, 'Saving is not switched on yet. This page only checks your file.'))];
  }

  shell('Upload past records',
    h('p', {}, 'Fill in the Excel template, then choose it here. The page checks every row and shows what would be added. The file is read in your browser and is not stored.'),
    h('div', { class: 'field' }, h('label', { for: 'xl' }, 'Excel file (.xlsx, up to 5 MB)'), input), out);
}
