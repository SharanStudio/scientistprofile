import { h } from './dom.js';
import { dateOnly, stamp, latestPerSlug, isFlag, opsText, countWords, SOFT_LIMIT_WORDS } from './summaries.js';

const STALE_DAYS = 180;
const isStale = (iso) => Date.now() - new Date(iso).getTime() > STALE_DAYS * 864e5;

// One report line, frozen at save time so an old report never changes when a summary or project is edited or deleted later.
export const toItem = (r, projectName) => ({
  slug: r.slug, version_id: r.id, project_id: r.project_id, project_name: projectName || '(project removed)',
  title: r.title, updated_at: r.created_at, delta: r.blocks.delta, words: countWords(opsText(r.blocks.delta)),
});

// Pure helpers (kept separate so they can be tested without a browser)
export function moveItem(list, index, step) {
  const to = index + step;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = list.slice();
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
export const removeItem = (list, slug) => list.filter((x) => x.slug !== slug);
export const addItem = (list, item) => (list.some((x) => x.slug === item.slug) ? list : [...list, item]);
export function matches(item, q) {
  const t = q.trim().toLowerCase();
  return !t || `${item.project_name} ${item.title}`.toLowerCase().includes(t);
}

let held = null; // unsaved picker state, so you can leave the page and come back: { key, title, order }

/* ---------- saved reports ---------- */
export async function viewReports(ctx) {
  const { sb, shell, loadingShell, friendly } = ctx;
  loadingShell('Reports');
  const { data, error } = await sb.from('reports').select('id,title,created_at,updated_at,docx_path,items').order('created_at', { ascending: false });
  if (error) return shell('Reports', h('div', { class: 'flash error' }, friendly(error)));
  const rows = data.map((r) => {
    const del = h('button', { class: 'link danger' }, 'Delete');
    let armed = null;
    del.addEventListener('click', async () => {
      if (!armed) {
        del.textContent = 'Tap again to confirm';
        armed = setTimeout(() => { armed = null; del.textContent = 'Delete'; }, 4000);
        return;
      }
      clearTimeout(armed);
      const { error: er } = await sb.from('reports').delete().eq('id', r.id);
      ctx.setFlash(er ? 'error' : 'ok', er ? friendly(er) : 'Report deleted.');
      viewReports(ctx);
    });
    const n = Array.isArray(r.items) ? r.items.length : 0;
    return h('li', { class: 'row' },
      h('div', { class: 'row-main' }, r.title, h('div', { class: 'sub' }, `Saved ${dateOnly(r.created_at)} · ${n} ${n === 1 ? 'summary' : 'summaries'}`)),
      h('div', { class: 'row-actions' }, h('a', { href: `#/report/${r.id}` }, 'Open'), del));
  });
  shell('Reports',
    h('p', { class: 'lede' }, 'Saved reports stay here until you delete one yourself. Nothing is removed automatically.'),
    h('div', { class: 'toolbar' }, h('a', { class: 'btn primary', href: '#/report/new' }, 'Build a report')),
    rows.length ? h('ul', { class: 'rows' }, rows) : h('p', { class: 'empty' }, 'No saved reports yet.'));
}

/* ---------- report builder: choose and order summaries ---------- */
export async function viewReportBuilder(ctx, id) {
  const { sb, shell, loadingShell, friendly, go } = ctx;
  const isNew = !id || id === 'new';
  const key = isNew ? 'new' : id;
  loadingShell('Build a report');
  const [pr, sr, rr] = await Promise.all([
    sb.from('entries').select('id,data').eq('section', 'project'),
    sb.from('summaries').select('*').order('created_at', { ascending: false }),
    isNew ? Promise.resolve({ data: null, error: null }) : sb.from('reports').select('*').eq('id', id).maybeSingle(),
  ]);
  const err = pr.error || sr.error || rr.error;
  if (err) return shell('Build a report', h('div', { class: 'flash error' }, friendly(err)));
  if (!isNew && !rr.data) { ctx.setFlash('error', 'Report not found.'); return go('#/reports'); }

  const names = new Map(pr.data.map((p) => [p.id, p.data && p.data.name]));
  const current = [...latestPerSlug(sr.data).values()].filter((r) => !isFlag(r) && r.project_id)
    .map((r) => toItem(r, names.get(r.project_id)));
  const bySlug = new Map(current.map((x) => [x.slug, x]));
  // Project order first (as in your Projects list), then newest summary first, for the "available" list
  current.sort((a, b) => (a.project_name === b.project_name ? (a.updated_at < b.updated_at ? 1 : -1) : a.project_name.localeCompare(b.project_name)));

  const start = held && held.key === key ? held : { key, title: isNew ? `Scientist Profile – ${dateOnly(new Date().toISOString())}` : rr.data.title, order: isNew ? [] : rr.data.items };
  held = start;
  let query = '';

  const titleIn = h('input', { id: 'rep_title', type: 'text', maxlength: 150, value: start.title });
  titleIn.addEventListener('input', () => { held.title = titleIn.value; });
  const msg = h('div', { class: 'err', role: 'alert' });
  const pickedBox = h('div', {});
  const availBox = h('div', {});
  const pickedHead = h('h2', {}, 'In this report');
  const search = h('input', { type: 'search', placeholder: 'Search project or title…', 'aria-label': 'Search summaries' });
  search.addEventListener('input', () => { query = search.value; drawAvail(); });

  const tags = (it) => [
    isStale(it.updated_at) ? h('span', { class: 'tag' }, 'older than 6 months') : null,
    it.words > SOFT_LIMIT_WORDS ? h('span', { class: 'tag' }, `${it.words} words, may exceed one page`) : null,
    bySlug.has(it.slug) && bySlug.get(it.slug).version_id !== it.version_id ? h('span', { class: 'tag ok' }, 'newer version saved') : null,
    !bySlug.has(it.slug) ? h('span', { class: 'tag muted' }, 'no longer in your summaries') : null,
  ];
  const line = (it) => [h('strong', {}, it.project_name),
    h('div', {}, it.title || '(untitled)'),
    h('div', { class: 'sub' }, `Last updated ${dateOnly(it.updated_at)} · ${it.words} ${it.words === 1 ? "word" : "words"}`), tags(it)];

  function drawPicked() {
    const order = held.order;
    pickedHead.textContent = `In this report (${order.length})`;
    if (!order.length) { pickedBox.replaceChildren(h('p', { class: 'empty' }, 'Nothing chosen yet. Add summaries from the list below.')); return; }
    pickedBox.replaceChildren(h('ul', { class: 'rows' }, order.map((it, i) => {
      const up = h('button', { class: 'link', 'aria-label': `Move ${it.title} up` }, 'Up');
      const down = h('button', { class: 'link', 'aria-label': `Move ${it.title} down` }, 'Down');
      const rm = h('button', { class: 'link danger', 'aria-label': `Remove ${it.title}` }, 'Remove');
      up.disabled = i === 0; down.disabled = i === order.length - 1;
      up.addEventListener('click', () => { held.order = moveItem(held.order, i, -1); drawPicked(); });
      down.addEventListener('click', () => { held.order = moveItem(held.order, i, 1); drawPicked(); });
      rm.addEventListener('click', () => { held.order = removeItem(held.order, it.slug); drawPicked(); drawAvail(); });
      return h('li', { class: 'row' }, h('div', { class: 'row-main' }, h('span', { class: 'order-n' }, `${i + 1}.`), ' ', line(it)),
        h('div', { class: 'row-actions' }, up, down, rm));
    })));
  }
  function drawAvail() {
    const chosen = new Set(held.order.map((x) => x.slug));
    const list = current.filter((it) => !chosen.has(it.slug) && matches(it, query));
    if (!current.length) { availBox.replaceChildren(h('p', { class: 'empty' }, 'You have no summaries yet. ', h('a', { href: '#/summaries' }, 'Write one'))); return; }
    if (!list.length) { availBox.replaceChildren(h('p', { class: 'empty' }, query ? 'Nothing matches.' : 'All your summaries are in the report.')); return; }
    availBox.replaceChildren(h('ul', { class: 'rows' }, list.map((it) => {
      const add = h('button', { class: 'link', 'aria-label': `Add ${it.title}` }, 'Add to report');
      add.addEventListener('click', () => { held.order = addItem(held.order, it); drawPicked(); drawAvail(); });
      return h('li', { class: 'row' }, h('div', { class: 'row-main' }, line(it)), h('div', { class: 'row-actions' }, add));
    })));
  }

  async function save(asNew) {
    msg.textContent = '';
    const title = titleIn.value.trim();
    if (!title) { msg.textContent = 'Give the report a title.'; titleIn.focus(); return; }
    if (!held.order.length) { msg.textContent = 'Choose at least one summary.'; return; }
    // Freeze each line from its newest saved version; keep the old snapshot if the summary no longer exists.
    const items = held.order.map((it) => bySlug.get(it.slug) || it);
    const res = (isNew || asNew)
      ? await sb.from('reports').insert({ title, items })
      : await sb.from('reports').update({ title, items }).eq('id', id);
    if (res.error) { msg.textContent = friendly(res.error); return; }
    held = null;
    ctx.setFlash('ok', `Saved "${title}" with ${items.length} ${items.length === 1 ? 'summary' : 'summaries'} (${stamp(new Date().toISOString())}).`);
    go('#/reports');
  }
  const saveBtn = h('button', { class: 'primary' }, isNew ? 'Save report' : 'Save changes');
  saveBtn.addEventListener('click', async () => { saveBtn.disabled = true; await save(false); saveBtn.disabled = false; });
  const copyBtn = isNew ? null : h('button', { class: 'secondary' }, 'Save as a new report');
  if (copyBtn) copyBtn.addEventListener('click', async () => { copyBtn.disabled = true; await save(true); copyBtn.disabled = false; });
  const clearBtn = h('button', { class: 'link' }, 'Clear selection');
  clearBtn.addEventListener('click', () => { held.order = []; drawPicked(); drawAvail(); });
  const addAll = h('button', { class: 'link' }, 'Add all');
  addAll.addEventListener('click', () => { for (const it of current) held.order = addItem(held.order, it); drawPicked(); drawAvail(); });

  shell(isNew ? 'Build a report' : 'Edit report',
    h('p', { class: 'lede' }, 'Choose the summaries for the report and set their order. The report places them at the end, one per page, in this order. A project can contribute more than one.'),
    h('div', { class: 'form' }, h('div', { class: 'field' }, h('label', { for: 'rep_title' }, 'Report title'), titleIn)),
    pickedHead, pickedBox, h('div', { class: 'toolbar' }, clearBtn),
    h('h2', {}, 'Available summaries'), h('div', { class: 'toolbar' }, addAll), search, availBox,
    msg,
    h('div', { class: 'actions' }, saveBtn, copyBtn, h('a', { class: 'btn', href: '#/reports' }, 'Cancel')),
    h('p', { class: 'hint' }, 'Saved reports stay in the database until you delete them yourself.'));
  drawPicked(); drawAvail();
}
