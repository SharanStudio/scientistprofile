import { h } from './dom.js';

// Small shared pieces for the Option C look: icons, data tables, icon buttons.
// Icons are fixed strings written here, never user text, so setting innerHTML is safe.
const PATHS = {
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  bin: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  open: '<path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>',
  up: '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14"/><path d="M6 13l6 6 6-6"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/>',
};
export function icon(name, size = 18) {
  const s = document.createElement('span');
  s.className = 'ico';
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  return s;
}

// Icon-only link, e.g. the pencil. The label is read aloud and shown as a tooltip.
export const iconLink = (href, label, name = 'edit') => h('a', { class: 'ib', href, 'aria-label': label, title: label }, icon(name));

// Icon-only button. With `confirm`, the first tap arms it (red, with a short word) and the second tap runs it.
export function iconButton(name, label, onClick, { danger = false, confirm = false } = {}) {
  const b = h('button', { type: 'button', class: `ib${danger ? ' danger' : ''}`, 'aria-label': label, title: label }, icon(name));
  let timer = null;
  const disarm = () => { timer = null; b.classList.remove('armed'); b.replaceChildren(icon(name)); b.setAttribute('aria-label', label); };
  b.addEventListener('click', (ev) => {
    if (confirm && !timer) {
      b.classList.add('armed');
      b.replaceChildren(icon(name), h('span', { class: 'ib-sure' }, 'Sure?'));
      b.setAttribute('aria-label', `${label}. Tap again to confirm`);
      timer = setTimeout(disarm, 4000);
      return;
    }
    if (timer) { clearTimeout(timer); disarm(); }
    onClick(ev, b);
  });
  return b;
}
export const deleteButton = (label, onConfirm) => iconButton('bin', label, onConfirm, { danger: true, confirm: true });

// A table that becomes a stack of cards on phones. Each cell carries its column name in data-label.
//   columns: [{ label, get(row) -> text or node, cls?, primary? }]
//   actions(row) -> array of nodes shown at the end of the row (omit for none)
export function dataTable({ columns, rows, actions, caption }) {
  const head = h('tr', {}, columns.map((c) => h('th', { scope: 'col', class: c.cls || false }, c.label)),
    actions ? h('th', { scope: 'col', class: 'dt-act' }, h('span', { class: 'sr' }, 'Actions')) : null);
  const body = rows.map((r) => h('tr', {},
    columns.map((c) => h('td', { 'data-label': c.label, class: `${c.cls || ''}${c.primary ? ' dt-primary' : ''}`.trim() || false }, c.get(r))),
    actions ? h('td', { class: 'dt-act' }, h('div', { class: 'dt-btns' }, actions(r))) : null));
  return h('div', { class: 'dt-wrap' }, h('table', { class: 'dt' },
    caption ? h('caption', { class: 'sr' }, caption) : null, h('thead', {}, head), h('tbody', {}, body)));
}

// Small coloured label, e.g. "On website".
export const pill = (text, kind = '') => h('span', { class: `pill${kind ? ` ${kind}` : ''}` }, text);
