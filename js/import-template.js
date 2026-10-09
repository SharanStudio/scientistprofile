import { STATES } from './states.js';
import { IMPORT_SECTIONS, LAYOUT, TEMPLATE_VERSION, columnTitles, importFields, schemaHash, whenHint } from './import-schema.js';
import { loadExcelJS } from './exceljs-loader.js';

// One example row per sheet. The reader ignores row 3, and a test checks that every example passes the same rules as real rows.
export const EXAMPLES = {
  teaching: { start_date: '2024-02-12', topic: 'Principles of outbreak investigation', course: 'Intermediate FETP, Cohort 1', mode: 'In-person' },
  field_visit: { start_date: '2024-03-04', end_date: '2024-03-08', project: 'Example project', district: 'Example district', state: 'Odisha', purpose: 'Supervision of an outbreak investigation' },
  training: { title: 'Workshop on surveillance data analysis', type: 'Workshop', level: 'National', start_date: '2024-06-10', end_date: '2024-06-12', participants: 30 },
  meeting: { kind: 'Committee meeting', start_date: '2024-04-02', committee: 'Library' },
  support: { kind: 'Programme support', programme: 'IDSP', level: 'State', states: ['Tamil Nadu', 'Kerala'], support_types: ['Capacity building', 'Secondary data analysis'], start_date: '2023-01-10' },
  policy: { type: 'Expert in a government committee', title: 'Expert group on disease surveillance guidelines', level: 'National', impact: 'Contributed to revised surveillance reporting guidance.', start_date: '2024-05-20' },
  peer_review: { journal: 'Example Journal of Epidemiology', role: 'Reviewer', start_date: '2024-02-01' },
  publication: {
    kind: 'Research publication', citation: 'Author A, Author B. Example title of the article. Example J Epidemiol. 2024;12(3):45-52.',
    start_date: '2024-07-01', doi: '10.1000/example.2024.001', roles: ['First author', 'Corresponding author'], journal_level: 'International',
    type: 'Original article', in_pubmed: 'Yes', impact_factor: 3.2, link: 'https://doi.org/10.1000/example.2024.001',
    summary: 'Example summary of up to fifty words.',
  },
};

const DATE_FMT = 'dd-mmm-yyyy';
const WIDTH = { date: 14, text: 32, textarea: 52, select: 24, multicheck: 36, int: 14, num: 14, url: 34, orcid: 22, checkbox: 12 };
const NOTE_LIST_MAX = 12;

const colLetter = (n) => { let s = ''; for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const isoToDate = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };

function noteFor(f, hint) {
  const lines = [];
  if (f.help) lines.push(f.help);
  if (hint) lines.push(hint);
  if (f.type === 'date') lines.push(`Date as ${DATE_FMT}, for example 15-Sep-2021.${f.noFuture ? ' Not in the future.' : ''}`);
  if (f.type === 'select') lines.push(f.options.length <= NOTE_LIST_MAX ? `Choose one: ${f.options.join(' / ')}.` : 'Choose from the dropdown list.');
  if (f.type === 'multicheck') {
    lines.push('Separate several values with a semicolon (;).');
    lines.push(f.options.length <= NOTE_LIST_MAX ? `Allowed: ${f.options.join('; ')}.` : 'Use the exact names on the Lists sheet.');
  }
  if (f.type === 'int') lines.push('A whole number.');
  if (f.type === 'num') lines.push('A number, for example 4.2.');
  if (f.words) lines.push(`${f.words} words or fewer.`);
  else if (f.max) lines.push(`Up to ${f.max} characters.`);
  return lines.join('\n');
}

function validationFor(f, listRange, cellRef) {
  const base = { allowBlank: true, showErrorMessage: true, errorStyle: 'stop' };
  if (f.type === 'select') return { ...base, type: 'list', formulae: [listRange], errorTitle: 'Pick from the list', error: 'Choose one of the values in the dropdown.' };
  // ExcelJS cannot write TODAY() into a date rule, so dates use a custom rule that Excel evaluates itself.
  // cellRef is the first cell of the range; Excel applies the formula relative to it.
  if (f.type === 'date') return { ...base, type: 'custom', formulae: [`AND(ISNUMBER(${cellRef}),${cellRef}>=DATE(1950,1,1),${cellRef}<=${f.noFuture ? 'TODAY()' : 'DATE(2099,12,31)'})`],
    errorTitle: 'Check the date', error: `Enter a date as ${DATE_FMT}, for example 15-Sep-2021${f.noFuture ? ', not in the future' : ''}.` };
  if (f.type === 'int') return { ...base, type: 'whole', operator: 'greaterThanOrEqual', formulae: [f.min ?? 0], errorTitle: 'Whole number', error: 'Enter a whole number.' };
  if (f.type === 'num') return { ...base, type: 'decimal', operator: 'between', formulae: [0, f.maxNum ?? 1000], errorTitle: 'Number', error: 'Enter a number such as 4.2.' };
  if ((f.type === 'text' || f.type === 'textarea') && f.max) return { ...base, type: 'textLength', operator: 'lessThanOrEqual', formulae: [f.max], errorTitle: 'Too long', error: `Keep this to ${f.max} characters or fewer.` };
  return null;
}

// Builds the workbook. ExcelJS is passed in, so the same code runs in the browser and in tests.
export function buildTemplate(ExcelJS) {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Scientist Profile';
  wb.created = new Date();

  const readme = wb.addWorksheet('Read me');
  const sheets = IMPORT_SECTIONS.map(([key, name]) => [key, name, wb.addWorksheet(name)]);
  const lists = wb.addWorksheet('Lists');
  const meta = wb.addWorksheet('_meta', { state: 'hidden' });

  // Lists sheet: one column per distinct set of dropdown values, shared by every sheet that uses it.
  const listRange = new Map();
  let listCol = 0;
  const headFont = { bold: true, color: { argb: 'FFFFFFFF' } };
  const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
  for (const [key, name] of IMPORT_SECTIONS) {
    for (const f of importFields(key)) {
      if (!f.options || listRange.has(JSON.stringify(f.options))) continue;
      listCol += 1;
      const L = colLetter(listCol);
      const c = lists.getCell(`${L}1`);
      c.value = f.options === STATES ? 'States and union territories' : `${name}: ${f.label}`;
      c.font = headFont; c.fill = headFill;
      f.options.forEach((o, i) => { lists.getCell(`${L}${i + 2}`).value = o; });
      lists.getColumn(listCol).width = 40;
      listRange.set(JSON.stringify(f.options), `Lists!$${L}$2:$${L}$${f.options.length + 1}`);
    }
  }
  lists.views = [{ state: 'frozen', ySplit: 1 }];

  for (const [key, , ws] of sheets) {
    const fields = importFields(key);
    const titles = columnTitles(fields).map((c) => c.title);
    const example = EXAMPLES[key];

    ws.columns = fields.map((f) => ({
      key: f.key, width: WIDTH[f.type] || 24,
      style: {
        numFmt: f.type === 'date' ? DATE_FMT : f.type === 'int' ? '0' : f.type === 'num' ? '0.0#' : ['text', 'textarea', 'url', 'select', 'multicheck'].includes(f.type) ? '@' : 'General',
        alignment: { vertical: 'top', wrapText: f.type === 'textarea' || f.type === 'text' },
      },
    }));

    const keyRow = ws.getRow(LAYOUT.keyRow);
    const headRow = ws.getRow(LAYOUT.headerRow);
    const exRow = ws.getRow(LAYOUT.exampleRow);
    fields.forEach((f, i) => {
      const kc = keyRow.getCell(i + 1); kc.value = f.key; kc.font = { color: { argb: 'FF999999' }, size: 8 };
      const hc = headRow.getCell(i + 1);
      hc.value = titles[i]; hc.font = headFont; hc.fill = headFill;
      hc.alignment = { vertical: 'middle', wrapText: true };
      const note = noteFor(f, whenHint(fields, f));
      if (note) hc.note = note;
      const v = example[f.key];
      const ec = exRow.getCell(i + 1);
      if (v !== undefined && v !== null) {
        ec.value = f.type === 'date' ? isoToDate(v) : Array.isArray(v) ? v.join('; ') : v;
      }
      ec.font = { italic: true, color: { argb: 'FF808080' } };
      ec.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    });
    keyRow.hidden = true;
    headRow.height = 38;
    exRow.getCell(1).note = 'Example row. It is ignored on upload. Type your records from row 4 down.';

    const first = LAYOUT.firstDataRow;
    const last = first + LAYOUT.capacity - 1;
    fields.forEach((f, i) => {
      const L = colLetter(i + 1);
      const dv = validationFor(f, f.options ? listRange.get(JSON.stringify(f.options)) : '', `${L}${first}`);
      if (!dv) return;
      ws.dataValidations.add(`${L}${first}:${L}${last}`, dv);
    });
    ws.views = [{ state: 'frozen', ySplit: LAYOUT.headerRow, activeCell: `A${first}` }];
  }

  // Read me
  readme.getColumn(1).width = 110;
  const lines = [
    ['Scientist Profile: upload workbook', 'title'],
    ['', ''],
    ['How to use', 'head'],
    ['1. Open a sheet and type your records from row 4 down. Row 3 (grey) is an example and is ignored.', ''],
    ['2. Fill every column marked *. A column marked † applies only to some rows; its header note says which. Leave the others blank.', ''],
    ['3. Write dates as dd-mmm-yyyy, for example 15-Sep-2021.', ''],
    ['4. Pick dropdown values from the list. Where a column takes several values, separate them with a semicolon (;).', ''],
    ['5. Save the file as .xlsx and upload it on the Upload page. The app reads the file in your browser and keeps no copy of it.', ''],
    ['', ''],
    ['Please do not', 'head'],
    ['Rename or reorder the sheets, move or delete columns, or unhide and delete the first row (it holds the column ids).', ''],
    ['Insert rows above row 4.', ''],
    ['', ''],
    ['Good to know', 'head'],
    ['Peer review and Publication rows dated before your joining date are tagged "before joining" automatically.', ''],
    ['A row that matches an entry you already saved is skipped, so uploading a corrected file again is safe.', ''],
    ['The app reports every error before it saves anything. Nothing is saved until every row passes.', ''],
    ['', ''],
    [`Template ${TEMPLATE_VERSION}, schema ${schemaHash()}`, 'small'],
  ];
  lines.forEach(([text, kind], i) => {
    const c = readme.getCell(`A${i + 1}`);
    c.value = text;
    c.alignment = { wrapText: true, vertical: 'top' };
    if (kind === 'title') c.font = { bold: true, size: 16 };
    if (kind === 'head') c.font = { bold: true, size: 12 };
    if (kind === 'small') c.font = { size: 8, color: { argb: 'FF999999' } };
  });

  meta.getCell('A1').value = 'template'; meta.getCell('B1').value = TEMPLATE_VERSION;
  meta.getCell('A2').value = 'schema'; meta.getCell('B2').value = schemaHash();
  meta.getCell('A3').value = 'generated'; meta.getCell('B3').value = new Date().toISOString();
  return wb;
}

export async function downloadTemplate() {
  const ExcelJS = await loadExcelJS();
  const buffer = await buildTemplate(ExcelJS).xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'scientist-profile-upload-template.xlsx';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
