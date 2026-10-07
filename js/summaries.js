import { h } from './dom.js';

// Rich-text editor (Quill, loaded from a CDN only when you open a summary).
const QUILL_JS = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/+esm';
const QUILL_CSS = 'https://cdn.jsdelivr.net/npm/quill@2.0.3/dist/quill.snow.css';
const FORMATS = ['bold', 'italic', 'underline', 'script', 'header', 'list', 'indent', 'link'];
const TOOLBAR = [['bold', 'italic', 'underline'], [{ script: 'sub' }, { script: 'super' }], [{ header: [2, 3, false] }],
  [{ list: 'ordered' }, { list: 'bullet' }], [{ indent: '-1' }, { indent: '+1' }], ['link'], ['clean']];
export const SOFT_LIMIT_WORDS = 500; // your six current summaries run 350 to 455 words and fit one page

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
export const isFlag = (r) => r.flag === 'true' || r.flag === true || (r.blocks && r.blocks.none === true);
export const opsText = (ops) => (ops || []).map((o) => (typeof o.insert === 'string' ? o.insert : ' ')).join('');
export const countWords = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

// A summary is a series of saved versions that share one slug. Rows arrive newest first, so the first row per slug is current.
export function latestPerSlug(rows) {
  const map = new Map();
  for (const r of rows) if (!map.has(r.slug)) map.set(r.slug, r);
  return map;
}

// Current (latest) real summaries, grouped by project id. Flag rows ("no summary needed") are returned separately.
export function groupByProject(rows) {
  const summaries = new Map();
  const flags = new Map();
  for (const r of latestPerSlug(rows).values()) {
    if (!r.project_id) continue;
    if (isFlag(r)) flags.set(r.project_id, r);
    else (summaries.get(r.project_id) || summaries.set(r.project_id, []).get(r.project_id)).push(r);
  }
  for (const list of summaries.values()) list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return { summaries, flags };
}

/* ---------- list: projects, each with its summaries ---------- */
export async function viewSummaries(ctx) {
  const { sb, shell, loadingShell, friendly, state } = ctx;
  loadingShell('One-page summaries');
  const [pr, sr] = await Promise.all([
    sb.from('entries').select('*').eq('section', 'project'),
    sb.from('summaries').select('id,slug,project_id,title,created_at,flag:blocks->>none').order('created_at', { ascending: false }),
  ]);
  const err = pr.error || sr.error;
  if (err) return shell('One-page summaries', h('div', { class: 'flash error' }, friendly(err)));

  const projects = pr.data.slice().sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
  const { summaries, flags } = groupByProject(sr.data);
  const stateOf = (p) => (summaries.has(p.id) ? 'have' : flags.has(p.id) ? 'none' : 'need');
  const n = { need: 0, have: 0, none: 0 };
  projects.forEach((p) => { n[stateOf(p)] += 1; });
  const total = [...summaries.values()].reduce((a, l) => a + l.length, 0);
  state.sumFilter ||= 'all';

  const listBox = h('div', {});
  const rowFor = (p) => {
    const st = stateOf(p);
    const list = summaries.get(p.id) || [];
    const actions = [];
    if (st === 'none') {
      const b = h('button', { class: 'link' }, 'Unflag');
      b.addEventListener('click', async () => {
        const { error } = await sb.from('summaries').delete().eq('project_id', p.id).eq('blocks->>none', 'true');
        ctx.setFlash(error ? 'error' : 'ok', error ? friendly(error) : 'Flag removed.');
        viewSummaries(ctx);
      });
      actions.push(h('a', { href: `#/summary/${p.id}/new` }, 'Write one'), b);
    } else {
      actions.push(h('a', { href: `#/summary/${p.id}/new` }, st === 'have' ? 'Add another summary' : 'Write a summary'));
      if (st === 'need') {
        const b = h('button', { class: 'link' }, 'No summary needed');
        b.addEventListener('click', async () => {
          const { error } = await sb.from('summaries').insert({ slug: p.id, project_id: p.id, title: '', blocks: { none: true, delta: null } });
          ctx.setFlash(error ? 'error' : 'ok', error ? friendly(error) : 'Marked as "no summary needed".');
          viewSummaries(ctx);
        });
        actions.push(b);
      }
    }
    const tag = st === 'none' ? h('span', { class: 'tag muted' }, 'No summary needed')
      : st === 'need' ? h('span', { class: 'tag' }, 'No summary yet') : null;
    const items = list.map((r) => h('div', { class: 'sub-item' },
      h('a', { href: `#/summary/${p.id}/${r.slug}` }, r.title || '(untitled)'), ' ',
      h('span', { class: 'sub' }, `updated ${dateOnly(r.created_at)}`)));
    return h('li', { class: 'row' },
      h('div', { class: 'row-main' }, p.data.name, ' ', h('span', { class: 'sub' }, p.data.role === 'Co-investigator' ? 'Co-I' : 'PI'),
        items, tag ? h('div', {}, tag) : null),
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
    h('p', { class: 'lede' }, 'A project can have several summaries. You choose which ones go into a report, and in what order, when you build the report.'),
    h('div', { class: 'toolbar' }, h('a', { class: 'btn primary', href: '#/report/new' }, 'Build a report')),
    h('div', { class: 'status' }, `${total} ${total === 1 ? 'summary' : 'summaries'} across ${n.have} of ${projects.length} projects · ${n.need} projects still to write · ${n.none} marked "no summary needed"`),
    projects.length ? h('label', { class: 'fl' }, h('span', {}, 'Show'), sel) : null, listBox);
  draw();
}

/* ---------- editor: one summary of one project ---------- */
export async function viewSummaryEditor(ctx, projectId, slugArg) {
  const { sb, shell, loadingShell, friendly, go } = ctx;
  if (!slugArg) return go('#/summaries');
  const isNew = slugArg === 'new';
  const slug = isNew ? crypto.randomUUID() : slugArg;
  loadingShell('One-page summary');
  let Quill;
  try {
    const [pr, sr, q] = await Promise.all([
      sb.from('entries').select('*').eq('id', projectId).maybeSingle(),
      isNew ? Promise.resolve({ data: [], error: null })
        : sb.from('summaries').select('*').eq('slug', slug).order('created_at', { ascending: false }).limit(25),
      loadQuill(),
    ]);
    Quill = q;
    if (pr.error || sr.error) throw (pr.error || sr.error);
    if (!pr.data || pr.data.section !== 'project') { ctx.setFlash('error', 'Project not found.'); return go('#/summaries'); }
    if (!isNew && !sr.data.length) { ctx.setFlash('error', 'Summary not found.'); return go('#/summaries'); }
    return render(ctx, Quill, pr.data, sr.data, slug, isNew);
  } catch (e) {
    const offline = /import|fetch|network|load/i.test(String(e && e.message));
    shell('One-page summary', h('div', { class: 'flash error' }, offline ? 'The editor could not load. Check your internet connection and try again.' : friendly(e)),
      h('a', { class: 'btn', href: '#/summaries' }, 'Back to summaries'));
  }
}

function render(ctx, Quill, project, versions, slug, isNew) {
  const { sb, shell, friendly, go } = ctx;
  const latest = versions[0] || null;
  const draftKey = `sp-sum-draft-${slug}`;
  const readDraft = () => { try { return JSON.parse(localStorage.getItem(draftKey) || 'null'); } catch { return null; } };
  const writeDraft = (d) => { try { localStorage.setItem(draftKey, JSON.stringify(d)); } catch { /* storage may be blocked */ } };
  const clearDraft = () => { try { localStorage.removeItem(draftKey); } catch { /* ignore */ } };

  const titleIn = h('input', { id: 'sum_title', type: 'text', maxlength: 120, autocomplete: 'off', placeholder: 'Short name, for example MAFLD' });
  titleIn.value = latest ? latest.title : '';
  const err = h('div', { class: 'err', role: 'alert' });
  const counter = h('div', { class: 'hint count' });
  const preview = h('div', { class: 'preview' });
  const dirtyTag = h('span', { class: 'tag', hidden: true }, 'Unsaved changes');
  const host = h('div', { class: 'ql-host' });
  const editorBox = h('div', { class: 'editor-box' }, host, counter);
  const draftBanner = h('div', { class: 'flash warn', hidden: true });

  const savedBtn = h('button', { class: 'primary' }, 'Save');
  const confirmBtn = latest ? h('button', { class: 'secondary' }, 'Confirm still up to date') : null;
  const historyBox = h('details', { class: 'filters' }, h('summary', {}, `Version history (${versions.length})`));

  shell(isNew ? 'New one-page summary' : 'One-page summary',
    h('p', { class: 'lede' }, project.data.name),
    draftBanner,
    h('div', { class: 'form' },
      h('div', { class: 'field' }, h('label', { for: 'sum_title' }, 'Summary title', h('span', { class: 'req' }, ' *')), titleIn,
        h('div', { class: 'hint' }, 'The report prints "One page summary – " before this title. Give each summary of a project its own title.')),
      editorBox, preview, err),
    h('div', { class: 'actions' }, savedBtn, confirmBtn, h('a', { class: 'btn', href: '#/summaries' }, 'Back'), dirtyTag),
    versions.length ? historyBox : null);

  const quill = new Quill(host, { theme: 'snow', formats: FORMATS, placeholder: 'Write or paste the summary here…', modules: { toolbar: TOOLBAR } });
  const setOps = (ops) => quill.setContents(ops && ops.length ? ops : [{ insert: '\n' }], 'silent');
  setOps(latest && latest.blocks ? latest.blocks.delta : null);

  const snapshot = () => ({ title: titleIn.value.trim(), ops: quill.getContents().ops });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const baseline = latest ? { title: latest.title, ops: latest.blocks.delta } : { title: '', ops: [{ insert: '\n' }] };

  const refresh = (touchDraft = true) => {
    const snap = snapshot();
    const words = countWords(quill.getText());
    counter.textContent = `${words} words`;
    counter.classList.toggle('over', words > SOFT_LIMIT_WORDS);
    if (words > SOFT_LIMIT_WORDS) counter.textContent += `. Over ${SOFT_LIMIT_WORDS} words, so it may not fit one page. Check the page count in the Word file.`;
    const when = latest ? dateOnly(latest.created_at) : 'the day you save';
    preview.textContent = `Report heading: One page summary – ${snap.title || '…'} (last updated ${when})`;
    const dirty = !same(snap, baseline);
    dirtyTag.hidden = !dirty;
    if (touchDraft) { if (dirty) writeDraft({ ...snap, at: Date.now() }); else clearDraft(); }
  };
  quill.on('text-change', () => refresh());
  titleIn.addEventListener('input', () => refresh());
  refresh(false); // first paint must not touch a saved draft

  // Offer an unsaved draft left by an accidental reload
  const draft = readDraft();
  if (draft && !same({ title: draft.title, ops: draft.ops }, baseline)) {
    draftBanner.hidden = false;
    const restore = h('button', { class: 'link' }, 'Restore it');
    const discard = h('button', { class: 'link' }, 'Discard');
    draftBanner.append('You have an unsaved draft from earlier. ', restore, ' · ', discard);
    restore.addEventListener('click', () => { titleIn.value = draft.title || ''; setOps(draft.ops); draftBanner.hidden = true; refresh(); });
    discard.addEventListener('click', () => { clearDraft(); draftBanner.hidden = true; });
  }

  async function persist(snap, okText) {
    const { error } = await sb.from('summaries').insert({ slug, project_id: project.id, title: snap.title, blocks: { none: false, delta: snap.ops } });
    if (error) { err.textContent = friendly(error); return false; }
    // A real summary replaces any earlier "no summary needed" flag on this project.
    if (isNew) await sb.from('summaries').delete().eq('project_id', project.id).eq('blocks->>none', 'true');
    clearDraft();
    ctx.setFlash('ok', okText);
    return true;
  }
  savedBtn.addEventListener('click', async () => {
    err.textContent = '';
    const snap = snapshot();
    if (!snap.title) { err.textContent = 'Enter a title for the summary.'; titleIn.focus(); return; }
    if (!quill.getText().trim()) { err.textContent = 'The summary is empty. Write something first.'; return; }
    if (same(snap, baseline)) { err.textContent = 'Nothing has changed since the last save. Use "Confirm still up to date" to refresh the date.'; return; }
    savedBtn.disabled = true;
    const ok = await persist(snap, `Saved. Last updated ${stamp(new Date().toISOString())}.`);
    savedBtn.disabled = false;
    if (ok) go(`#/summary/${project.id}/${slug}`);
  });
  if (confirmBtn) confirmBtn.addEventListener('click', async () => {
    err.textContent = '';
    confirmBtn.disabled = true;
    const ok = await persist({ title: latest.title, ops: latest.blocks.delta }, `Confirmed up to date on ${stamp(new Date().toISOString())}.`);
    confirmBtn.disabled = false;
    if (ok) viewSummaryEditor(ctx, project.id, slug);
  });

  // History: load any older version into the editor (saves only when you press Save)
  if (versions.length) {
    historyBox.append(h('ul', { class: 'rows' }, versions.map((v, i) => {
      const load = h('button', { class: 'link' }, 'Load into editor');
      load.addEventListener('click', () => {
        titleIn.value = v.title; setOps(v.blocks.delta);
        refresh(); window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      return h('li', { class: 'row' },
        h('div', { class: 'row-main' }, stamp(v.created_at), i === 0 ? ' (current)' : '', ' ',
          h('span', { class: 'sub' }, `${v.title}, ${countWords(opsText(v.blocks.delta))} words`)),
        h('div', { class: 'row-actions' }, load));
    })));
  }
}
