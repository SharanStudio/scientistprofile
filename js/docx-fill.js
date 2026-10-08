// Fills templates/profile.docx with the model from profile-data.js and appends the chosen summaries.
// Uses only standard DOM calls, so the same code runs in the browser and in Node tests (with xmldom).

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const BAD_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
const clean = (s) => String(s == null ? '' : s).replace(BAD_XML, '');

const kids = (n, name) => Array.from(n.childNodes).filter((c) => c.nodeType === 1 && c.localName === name && c.namespaceURI === W);
const first = (n, name) => kids(n, name)[0] || null;
const all = (n, name) => Array.from(n.getElementsByTagNameNS(W, name));
const el = (doc, name, attrs = {}) => {
  const e = doc.createElementNS(W, `w:${name}`);
  for (const [k, v] of Object.entries(attrs)) e.setAttributeNS(W, `w:${k}`, String(v));
  return e;
};
const textOf = (n) => all(n, 't').map((t) => t.textContent).join('');

/* ---------- text into runs and cells ---------- */
function setRunText(doc, run, text) {
  for (const c of Array.from(run.childNodes)) if (c.localName !== 'rPr') run.removeChild(c);
  const parts = clean(text).split(/\r?\n/);
  parts.forEach((part, i) => {
    if (i > 0) run.appendChild(el(doc, 'br'));
    const t = el(doc, 't');
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    t.appendChild(doc.createTextNode(part));
    run.appendChild(t);
  });
}

// Puts `text` in the cell's first run, keeping that run's font and size; drops everything else in the cell.
function setCellText(doc, tc, text) {
  const ps = kids(tc, 'p');
  const p = ps[0];
  for (const extra of ps.slice(1)) tc.removeChild(extra);
  let run = first(p, 'r');
  if (!run) {
    run = el(doc, 'r');
    const ppr = first(p, 'pPr');
    const prr = ppr && first(ppr, 'rPr');
    if (prr) run.appendChild(prr.cloneNode(true));
    p.appendChild(run);
  }
  for (const r of kids(p, 'r').slice(1)) p.removeChild(r);
  for (const c of Array.from(p.childNodes)) if (c.localName !== 'pPr' && c !== run) p.removeChild(c);
  setRunText(doc, run, text);
}

// Replaces [[token]] text inside one run in a paragraph that sits outside the tables.
function fillTokens(doc, header) {
  for (const t of all(doc.documentElement, 't')) {
    const m = /\[\[(\w+)\]\]/.exec(t.textContent);
    if (!m || m[1] === 'citation') continue;
    const v = header[m[1]];
    if (v === undefined) continue;
    const parts = clean(v).split(/\r?\n/);
    t.textContent = t.textContent.replace(m[0], parts[0]);
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
  }
}

/* ---------- tables ---------- */
function fillTable(doc, tbl, rows) {
  const trs = kids(tbl, 'tr');
  const sample = trs[1];
  if (!sample) return;
  const cells = (tr) => kids(tr, 'tc');
  rows.forEach((row) => {
    const tr = sample.cloneNode(true);
    cells(tr).forEach((tc, i) => setCellText(doc, tc, row[i] == null ? '' : row[i]));
    tbl.insertBefore(tr, sample);
  });
  tbl.removeChild(sample);
}

function fillCountTable(doc, tbl, matrix) {
  const trs = kids(tbl, 'tr');
  matrix.forEach((vals, r) => {
    const tr = trs[r + 1];
    if (!tr) return;
    const tcs = kids(tr, 'tc');
    vals.forEach((v, c) => { if (tcs[c + 1]) setCellText(doc, tcs[c + 1], v); });
  });
}

/* ---------- Quill delta to Word paragraphs ---------- */
const FONT = { ascii: 'Cambria', hAnsi: 'Cambria', cs: 'Cambria' };
const rFonts = (doc) => el(doc, 'rFonts', FONT);
const BULLET_NUM = 9001; // our own list definitions are appended to numbering.xml
const BULLET_ABS = 9001;
const ORDERED_ABS = 9002;

function runFor(doc, text, a, size) {
  const r = el(doc, 'r');
  const pr = el(doc, 'rPr');
  pr.appendChild(rFonts(doc));
  if (a.bold) { pr.appendChild(el(doc, 'b')); pr.appendChild(el(doc, 'bCs')); }
  if (a.italic) { pr.appendChild(el(doc, 'i')); pr.appendChild(el(doc, 'iCs')); }
  if (a.strike) pr.appendChild(el(doc, 'strike'));
  pr.appendChild(el(doc, 'sz', { val: size }));
  pr.appendChild(el(doc, 'szCs', { val: size }));
  if (a.underline) pr.appendChild(el(doc, 'u', { val: 'single' }));
  if (a.script === 'sub') pr.appendChild(el(doc, 'vertAlign', { val: 'subscript' }));
  if (a.script === 'super') pr.appendChild(el(doc, 'vertAlign', { val: 'superscript' }));
  r.appendChild(pr);
  const parts = clean(text).split('\t');
  parts.forEach((part, i) => {
    if (i > 0) r.appendChild(el(doc, 'tab'));
    const t = el(doc, 't');
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve');
    t.appendChild(doc.createTextNode(part));
    r.appendChild(t);
  });
  return r;
}

const HEAD_SIZE = { 1: 24, 2: 22, 3: 20 };

function paragraphFor(doc, runs, block, orderedNum, opts = {}) {
  const p = el(doc, 'p');
  const pPr = el(doc, 'pPr');
  if (opts.keepNext) pPr.appendChild(el(doc, 'keepNext'));
  if (opts.pageBreakBefore) pPr.appendChild(el(doc, 'pageBreakBefore'));
  if (block.list) {
    const numPr = el(doc, 'numPr');
    numPr.appendChild(el(doc, 'ilvl', { val: Math.min(Number(block.indent) || 0, 2) }));
    numPr.appendChild(el(doc, 'numId', { val: block.list === 'ordered' ? orderedNum : BULLET_NUM }));
    pPr.appendChild(numPr);
  }
  pPr.appendChild(el(doc, 'spacing', { before: 0, after: opts.after == null ? 80 : opts.after }));
  if (!block.list && block.indent) pPr.appendChild(el(doc, 'ind', { left: 360 * Number(block.indent) }));
  if (block.align === 'center' || block.align === 'right' || block.align === 'justify') {
    pPr.appendChild(el(doc, 'jc', { val: block.align === 'justify' ? 'both' : block.align }));
  }
  p.appendChild(pPr);
  runs.forEach((r) => p.appendChild(r));
  return p;
}

// Returns { paragraphs: [Element], orderedLists: number } and asks `nextOrderedId()` for a fresh numId per ordered list.
export function deltaToParagraphs(doc, delta, nextOrderedId) {
  const ops = Array.isArray(delta) ? delta : ((delta && delta.ops) || []); // the form stores a bare array of ops
  const out = [];
  let runs = [];
  let ordered = null; // numId of the ordered list currently open
  const flush = (block) => {
    if (block.list === 'ordered') { if (ordered == null) ordered = nextOrderedId(); } else ordered = null;
    const size = block.header ? (HEAD_SIZE[block.header] || 20) : 18;
    const body = runs.length ? runs : [];
    const finalRuns = block.header
      ? body.map((r) => { // headings render bold at their own size
        const pr = first(r, 'rPr');
        if (pr && !first(pr, 'b')) pr.insertBefore(el(doc, 'b'), first(pr, 'sz'));
        for (const s of kids(pr, 'sz').concat(kids(pr, 'szCs'))) s.setAttributeNS(W, 'w:val', String(size));
        return r;
      })
      : body;
    out.push(paragraphFor(doc, finalRuns, block, ordered, { after: block.header ? 100 : 80, keepNext: !!block.header }));
    runs = [];
  };
  for (const op of ops) {
    if (typeof op.insert !== 'string') continue; // images and other embeds are not printed
    const a = op.attributes || {};
    const pieces = op.insert.split('\n');
    pieces.forEach((piece, i) => {
      if (piece) runs.push(runFor(doc, piece, a, 18));
      if (i < pieces.length - 1) flush(a); // a newline closes the paragraph and carries the block format
    });
  }
  if (runs.length) flush({});
  return out;
}

/* ---------- numbering.xml additions ---------- */
function addNumbering(xmlDoc, orderedIds) {
  const root = xmlDoc.documentElement;
  const lvl = (i, fmt, text, font) => {
    const l = el(xmlDoc, 'lvl', { ilvl: i });
    l.appendChild(el(xmlDoc, 'start', { val: 1 }));
    l.appendChild(el(xmlDoc, 'numFmt', { val: fmt }));
    l.appendChild(el(xmlDoc, 'lvlText', { val: text }));
    l.appendChild(el(xmlDoc, 'lvlJc', { val: 'left' }));
    const ppr = el(xmlDoc, 'pPr');
    ppr.appendChild(el(xmlDoc, 'ind', { left: 360 * (i + 1), hanging: 270 }));
    l.appendChild(ppr);
    if (font) { const rp = el(xmlDoc, 'rPr'); rp.appendChild(el(xmlDoc, 'rFonts', { ascii: font, hAnsi: font, cs: font, hint: 'default' })); l.appendChild(rp); }
    return l;
  };
  const abs = (id, levels) => {
    const a = el(xmlDoc, 'abstractNum', { abstractNumId: id });
    a.appendChild(el(xmlDoc, 'multiLevelType', { val: 'hybridMultilevel' }));
    levels.forEach((l) => a.appendChild(l));
    return a;
  };
  const bullets = abs(BULLET_ABS, [lvl(0, 'bullet', '•', 'Arial'), lvl(1, 'bullet', '–', 'Arial'), lvl(2, 'bullet', '•', 'Arial')]);
  const decimals = abs(ORDERED_ABS, [lvl(0, 'decimal', '%1.'), lvl(1, 'lowerLetter', '%2.'), lvl(2, 'lowerRoman', '%3.')]);
  // abstractNum elements must come before every num element
  const firstNum = first(root, 'num');
  root.insertBefore(bullets, firstNum);
  root.insertBefore(decimals, firstNum);
  const num = (id, absId, restart) => {
    const n = el(xmlDoc, 'num', { numId: id });
    n.appendChild(el(xmlDoc, 'abstractNumId', { val: absId }));
    if (restart) {
      const o = el(xmlDoc, 'lvlOverride', { ilvl: 0 });
      o.appendChild(el(xmlDoc, 'startOverride', { val: 1 }));
      n.appendChild(o);
    }
    return n;
  };
  root.appendChild(num(BULLET_NUM, BULLET_ABS, false));
  orderedIds.forEach((id) => root.appendChild(num(id, ORDERED_ABS, true)));
}

/* ---------- the whole build ---------- */
// deps: { JSZip, DOMParser, XMLSerializer }. Returns the finished file as `outType` (default 'blob').
export async function buildProfileDocx({ templateBytes, model, summaries = [], deps, outType = 'blob', onStep = () => {} }) {
  const { JSZip, DOMParser: DP, XMLSerializer: XS } = deps;
  const parse = (s) => new DP().parseFromString(s, 'application/xml');
  const ser = (d) => new XS().serializeToString(d);

  onStep('Opening the template');
  const zip = await JSZip.loadAsync(templateBytes);
  const doc = parse(await zip.file('word/document.xml').async('string'));
  const body = first(doc.documentElement, 'body');

  onStep('Filling your details and tables');
  fillTokens(doc, model.header);
  const tbls = kids(body, 'tbl');
  model.tables.forEach((rows, i) => { if (rows && tbls[i]) fillTable(doc, tbls[i], rows); });
  for (const [i, matrix] of Object.entries(model.countTables)) fillCountTable(doc, tbls[Number(i)], matrix);

  // non-research publications: one numbered line each, cloned from the sample line
  const sample = kids(body, 'p').find((p) => textOf(p).includes('[[citation]]'));
  if (sample) {
    for (const c of model.nonResearch) {
      const p = sample.cloneNode(true);
      const run = first(p, 'r');
      if (!first(run, 'rPr')) { // borrow the paragraph's font, but not its bold
        const ppr = first(p, 'pPr');
        const mark = ppr && first(ppr, 'rPr');
        if (mark) {
          const rp = mark.cloneNode(true);
          for (const b of kids(rp, 'b').concat(kids(rp, 'bCs'))) rp.removeChild(b);
          run.insertBefore(rp, run.firstChild);
        }
      }
      setRunText(doc, run, c);
      body.insertBefore(p, sample);
    }
    body.removeChild(sample);
  }

  onStep('Adding the summaries');
  const children = Array.from(body.childNodes).filter((n) => n.nodeType === 1);
  const finalSect = children[children.length - 1];
  const breakPara = children.filter((n) => n.localName === 'p' && first(n, 'pPr') && first(first(n, 'pPr'), 'sectPr')).pop();
  const orderedIds = [];
  let nextId = 9100;
  const nextOrderedId = () => { const id = nextId++; orderedIds.push(id); return id; };

  if (summaries.length && breakPara) {
    let anchor = breakPara;
    const put = (p) => { body.insertBefore(p, anchor.nextSibling); anchor = p; };
    summaries.forEach((s, i) => {
      const head = paragraphFor(doc, [runFor(doc, `One page summary – ${s.title || '(untitled)'}`, { bold: true }, 22)], {}, null,
        { pageBreakBefore: i > 0, after: 40, keepNext: true });
      put(head);
      const stamp = `${s.project_name ? `${s.project_name} · ` : ''}Last updated ${s.updated_at ? s.updated_at.slice(0, 10).split('-').reverse().join('/') : ''}`;
      put(paragraphFor(doc, [runFor(doc, stamp, { italic: true }, 16)], {}, null, { after: 120 }));
      for (const p of deltaToParagraphs(doc, s.delta, nextOrderedId)) put(p);
    });
  } else if (breakPara) {
    // No summaries: the landscape section becomes the last section, so no blank portrait page follows.
    const ppr = first(breakPara, 'pPr');
    const sect = first(ppr, 'sectPr');
    body.replaceChild(sect.cloneNode(true), finalSect);
    ppr.removeChild(sect);
  }

  onStep('Packing the file');
  zip.file('word/document.xml', ser(doc));
  if (orderedIds.length || summaries.length) {
    const nf = zip.file('word/numbering.xml');
    if (nf) {
      const nd = parse(await nf.async('string'));
      addNumbering(nd, orderedIds);
      zip.file('word/numbering.xml', ser(nd));
    }
  }
  return zip.generateAsync({ type: outType, compression: 'DEFLATE' });
}
