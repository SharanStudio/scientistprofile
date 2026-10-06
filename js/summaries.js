import { h } from './dom.js';

// Rich-text editor (Quill, loaded from a CDN only when you open a summary).
const QUILL_JS = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/+esm';
const QUILL_CSS = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css';
const FORMATS = ['bold', 'italic', 'underline', 'script', 'header', 'list', 'indent', 'link'];
const TOOLBAR = [['bold', 'italic', 'underline'], [{ script: 'sub' }, { script: 'super' }], [{ header: [2, 3, false] }],
  [{ list: 'ordered' }, { list: 'bullet' }], [{ indent: '-1' }, { indent: '+1' }], ['link'], ['clean']];
const SOFT_LIMIT_WORDS = 500; // your six current summaries run 350 to 455 words and fit one page

let quillPromise;
function loadQuill() {
  if (!quillPromise) {
    if (!document.querySelector('link[data-quill]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = QUILL_CSS; l.setAttribute('data-quill', '');
      document.head.append(l);
    }
    quillPromise = import(QUILL_JS).then((m) => m.default || m.Quill).catch((e) => { quillPromise = null; throw e; });
  }
  return quillPromise;
}

const FMT = { day: '2-digit', month: '2-digit', year: 'numeric' };
export const dateOnly = (iso) => new Date(iso).toLocaleDateString('en-GB', FMT);
export const stamp = (iso) => new Date(iso).toLocaleString('en-GB', { ...FMT, hour: '2-digit', minute: '2-digit', hour12: false });
const isFlag = (r) => r.flag === 'true' || r.flag === true || (r.blocks && r.blocks.none === true);
const opsText = (ops) => (ops || []).map((o) => (typeof o.insert === 'string' ? o.insert : ' ')).join('');
const countWords = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

function latestPerProject(rows) {
  const map = new Map();
  for (const r of rows) if (!map.has(r.slug)) map.set(r.slug, r); // rows arrive newest first
  return map;
}

/* ---------- list: one row per project ---------- */
export async function viewSummaries(ctx) {
  const { sb, shell, loadingShell, friendly, state } = ctx;
  loadingShell('One-page summaries');
  const [pr, sr] = await Promise.all([
    sb.from('entries').select('*').eq('section', 'project'),
    sb.from('summaries').select('id,slug,title,created_at,flag:blocks->>none').order('created_at', { ascending: false }),
  ]);
  const err = pr.error || sr.error;
  if (err) return shell('One-page summaries', h('div', { class: 'flash error' }, friendly(err)));

  const projects = pr.data.slice().sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  const latest = latestPerProject(sr.data);
  const stateOf = (p) => { const r = latest.get(p.id); return !r ? 'need' : isFlag(r) ? 'none' : 'have'; };
  const n = { need: 0, have: 0, none: 0 };
  projects.forEach((p) => { n[stateOf(p)] += 1; });
  state.sumFilter ||= 'all';

  const listBox = h('div', {});
  const rowFor = (p) => {
    const st = stateOf(p), r = latest.get(p.id);
    const actions = [];
    if (st === 'none') {
      const b = h('button', { class: 'link' }, 'Unflag');
      b.addEventListener('click', async () => {
        const { error } = await sb.from('summaries').delete().eq('id', r.id);
        ctx.setFlash(error ? 'error' : 'ok', error ? friendly(error) : 'Flag removed.');
        viewSummaries(ctx);
      });
      actions.push(h('a', { href: `#/summary/${p.id}` }, 'Open'), b);
    } else {
      actions.push(h('a', { href: `#/summary/${p.id}` }, st === 'have' ? 'Edit' : 'Write'));
      if (st === 'need') {
        const b = h('button', { class: 'link' }, 'No summary needed');
        b.addEventListener('click', async () => {
          const { error } = await sb.from('summaries').insert({ slug: p.id, title: '', blocks: { none: true, delta: null } });
          ctx.setFlash(error ? 'error' : 'ok', error ? friendly(error) : 'Marked as "no summary needed".');
          viewSummaries(ctx);
        });
        actions.push(b);
      }
    }
    const tag = st === 'have' ? h('span', { class: 'tag ok' }, `Updated ${dateOnly(r.created_at)}`)
      : st === 'none' ? h('span', { class: 'tag muted' }, 'No summary needed')
      : h('span', { class: 'tag' }, 'No summary yet');
    return h('li', { class: 'row' },
      h('div', { class: 'row-main' }, p.data.name, ' ', h('span', { class: 'sub' }, p.data.role === 'Co-investigator' ? 'Co-I' : 'PI'),
        st === 'have' ? h('div', { class: 'sub' }, `Title: ${r.title}`) : null, h('div', {}, tag)),
      h('div', { class: 'row-actions' }, actions));
  };
  const draw = () => {
    const shown = projects.filter((p) => state.sumFilter === 'all' || stateOf(p) === state.sumFilter);
    listBox.replaceChildren(!projects.length
      ? h('p', { class: 'empty' }, 'Add your projects first. Each summary belongs to one project.', ' ', h('a', { href: '#/s/project/new' }, 'Add a project'))
      : shown.length ? h('ul', { class: 'rows' }, shown.map(rowFor)) : h('p', { class: 'empty' }, 'Nothing here.'));
  };
  const sel = h('select', { 'aria-label': 'Show' }, [['all', 'All projects'], ['need', 'Still to write'], ['have', 'Has a summary'], ['none', 'No summary needed']]
    .map(([v, t]) => h('option', { value: v }, t)));
  sel.value = state.sumFilter;
  sel.addEventListener('change', () => { state.sumFilter = sel.value; draw(); });

  shell('One-page summaries',
    h('p', { class: 'lede' }, 'One summary per project. The Word report prints each one under its title, with the date you last updated it.'),
    h('div', { class: 'status' }, `${n.have} of ${projects.length} projects have a summary · ${n.need} still to write · ${n.none} marked "no summary needed"`),
    projects.length ? h('label', { class: 'fl' }, h('span', {}, 'Show'), sel) : null, listBox);
  draw();
}

/* ---------- editor: one project ---------- */
export async function viewSummaryEditor(ctx, projectId) {
  const { sb, shell, loadingShell, friendly, go } = ctx;
  loadingShell('One-page summary');
  let Quill;
  try {
    const [pr, sr, q] = await Promise.all([
      sb.from('entries').select('*').eq('id', projectId).maybeSingle(),
      sb.from('summaries').select('*').eq('slug', projectId).order('created_at', { ascending: false }).limit(25),
      loadQuill(),
    ]);
    Quill = q;
    if (pr.error || sr.error) throw (pr.error || sr.error);
    if (!pr.data || pr.data.section !== 'project') { ctx.setFlash('error', 'Project not found.'); return go('#/summaries'); }
    return render(ctx, Quill, pr.data, sr.data);
  } catch (e) {
    const offline = /import|fetch|network|load/i.test(String(e && e.message));
    shell('One-page summary', h('div', { class: 'flash error' }, offline ? 'The editor could not load. Check your internet connection and try again.' : friendly(e)),
      h('a', { class: 'btn', href: '#/summaries' }, 'Back to summaries'));
  }
}

function render(ctx, Quill, project, versions) {
  const { sb, shell, friendly, go } = ctx;
  const latest = versions[0] || null;
  const content = versions.find((v) => !isFlag(v)) || null; // newest version that has text
  const draftKey = `sp-sum-draft-${project.id}`;
  const readDraft = () => { try { return JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch { return null; } };
  const writeDraft = (d) => { try { localStorage.setItem(draftKey, JSON.stringify(d)); } catch { /* storage may be blocked */ } };
  const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } };

  const titleIn = h('input', { id: 'sum_title', type: 'text', maxlength: 120, autocomplete: 'off', placeholder: 'Short name, for example MAFLD' });
  titleIn.value = content ? content.title : '';
  const noneCb = h('input', { id: 'sum_none', type: 'checkbox' });
  noneCb.checked = !!latest && isFlag(latest);
  const err = h('div', { class: 'err', role: 'alert' });
  const counter = h('div', { class: 'hint count' });
  const preview = h('div', { class: 'preview' });
  const dirtyTag = h('span', { class: 'tag', hidden: true }, 'Unsaved changes');
  const host = h('div', { class: 'ql-host' });
  const editorBox = h('div', { class: 'editor-box' }, host, counter);
  const draftBanner = h('div', { class: 'flash warn', hidden: true });

  const savedBtn = h('button', { class: 'primary' }, 'Save');
  const confirmBtn = latest && !isFlag(latest) ? h('button', { class: 'secondary' }, 'Confirm still up to date') : null;
  const historyBox = h('details', { class: 'filters' }, h('summary', {}, `Version history (${versions.length})`));

  shell('One-page summary',
    h('p', { class: 'lede' }, project.data.name),
    draftBanner,
    h('div', { class: 'form' },
      h('div', { class: 'field' }, h('label', { for: 'sum_title' }, 'Summary title', h('span', { class: 'req' }, ' *')), titleIn,
        h('div', { class: 'hint' }, 'The report prints "One page summary – " before this title.')),
      h('div', { class: 'field check' }, h('label', { for: 'sum_none' }, noneCb, ' This project has no one-page summary')),
      editorBox,
      preview, err),
    h('div', { class: 'actions' }, savedBtn, confirmBtn, h('a', { class: 'btn', href: '#/summaries' }, 'Back'), dirtyTag),
    versions.length ? historyBox : null);

  const quill = new Quill(host, { theme: 'snow', formats: FORMATS, placeholder: 'Write or paste the summary here…', modules: { toolbar: TOOLBAR } });
  const setOps = (ops) => quill.setContents(ops && ops.length ? ops : [{ insert: '\n' }], 'silent');
  setOps(content && content.blocks ? content.blocks.delta : null);

  const snapshot = () => ({ title: titleIn.value.trim(), none: noneCb.checked, ops: quill.getContents().ops });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const base = () => (latest ? { title: isFlag(latest) ? (content ? content.title : '') : latest.title, none: isFlag(latest),
    ops: isFlag(latest) ? (content && content.blocks.delta) || [{ insert: '\n' }] : latest.blocks.delta } : { title: '', none: false, ops: [{ insert: '\n' }] });
  const baseline = base();

  const refresh = (touchDraft = true) => {
    const snap = snapshot();
    editorBox.hidden = snap.none;
    const words = countWords(quill.getText());
    counter.textContent = `${words} words`;
    counter.classList.toggle('over', words > SOFT_LIMIT_WORDS);
    if (words > SOFT_LIMIT_WORDS) counter.textContent += `. Over ${SOFT_LIMIT_WORDS} words, so it may not fit one page. Check the page count in the Word file.`;
    const when = latest ? dateOnly(latest.created_at) : 'the day you save';
    preview.textContent = snap.none ? 'This project will be skipped in the report.'
      : `Report heading: One page summary – ${snap.title || '…'} (last updated ${when})`;
    const dirty = !same(snap, baseline);
    dirtyTag.hidden = !dirty;
    if (touchDraft) { if (dirty) writeDraft({ ...snap, at: Date.now() }); else clearDraft(); }
  };
  quill.on('text-change', () => refresh());
  titleIn.addEventListener('input', () => refresh());
  noneCb.addEventListener('change', () => refresh());
  refresh(false); // first paint must not touch a saved draft

  // Offer an unsaved draft left by an accidental reload
  const draft = readDraft();
  if (draft && !same({ title: draft.title, none: draft.none, ops: draft.ops }, baseline)) {
    draftBanner.hidden = false;
    const restore = h('button', { class: 'link' }, 'Restore it');
    const discard = h('button', { class: 'link' }, 'Discard');
    draftBanner.append('You have an unsaved draft from earlier. ', restore, ' · ', discard);
    restore.addEventListener('click', () => { titleIn.value = draft.title || ''; noneCb.checked = !!draft.none; setOps(draft.ops); draftBanner.hidden = true; refresh(); });
    discard.addEventListener('click', () => { clearDraft(); draftBanner.hidden = true; });
  }

  async function persist(snap, okText) {
    const { error } = await sb.from('summaries').insert({ slug: project.id, title: snap.none ? '' : snap.title, blocks: { none: snap.none, delta: snap.none ? null : snap.ops } });
    if (error) { err.textContent = friendly(error); return false; }
    clearDraft();
    ctx.setFlash('ok', okText);
    return true;
  }
  savedBtn.addEventListener('click', async () => {
    err.textContent = '';
    const snap = snapshot();
    if (!snap.none) {
      if (!snap.title) { err.textContent = 'Enter a title for the summary.'; titleIn.focus(); return; }
      if (!quill.getText().trim()) { err.textContent = 'The summary is empty. Write something, or tick "no one-page summary".'; return; }
    }
    if (same(snap, baseline)) { err.textContent = 'Nothing has changed since the last save. Use "Confirm still up to date" to refresh the date.'; return; }
    savedBtn.disabled = true;
    const ok = await persist(snap, `Saved. Last updated ${stamp(new Date().toISOString())}.`);
    savedBtn.disabled = false;
    if (ok) viewSummaryEditor(ctx, project.id);
  });
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    err.textContent = '';
    confirmBtn.disabled = true;
    const ok = await persist({ title: latest.title, none: false, ops: latest.blocks.delta }, `Confirmed up to date on ${stamp(new Date().toISOString())}.`);
    confirmBtn.disabled = false;
    if (ok) viewSummaryEditor(ctx, project.id);
  });

  // History: load any older version into the editor (saves only when you press Save)
  if (versions.length) {
    historyBox.append(h('ul', { class: 'rows' }, versions.map((v, i) => {
      const flagged = isFlag(v);
      const load = h('button', { class: 'link' }, 'Load into editor');
      load.addEventListener('click', () => {
        titleIn.value = flagged ? titleIn.value : v.title; noneCb.checked = flagged;
        if (!flagged) setOps(v.blocks.delta);
        refresh(); window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      return h('li', { class: 'row' },
        h('div', { class: 'row-main' }, stamp(v.created_at), i === 0 ? ' (current)' : '', ' ',
          h('span', { class: 'sub' }, flagged ? 'marked "no summary needed"' : `${v.title}, ${countWords(opsText(v.blocks.delta))} words`)),
        h('div', { class: 'row-actions' }, load));
    })));
  }
}
