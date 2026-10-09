import { h, today } from './dom.js';
import { MIN_DATE, wordCount, isVisible, cleanValues, validateValues } from './rules.js';

// Field options: key, type (text, textarea, select, multicheck, checkbox, date, int, num, url, orcid), label, required,
// help, max (characters), words (word limit), options, showIf(values), pattern + patternMsg, norm(value), noFuture.
export function buildForm(fields, initial = {}) {
  const inputs = {};
  const errs = {};
  const rows = {};
  const listeners = [];

  function make(f) {
    const id = `f_${f.key}`;
    let input;
    const v = initial[f.key];
    if (f.type === 'textarea') {
      input = h('textarea', { id, rows: f.rows || 3, maxlength: f.max || false });
      input.value = v ?? '';
    } else if (f.type === 'select') {
      input = h('select', { id }, h('option', { value: '' }, 'Select…'),
        f.options.map((o) => h('option', { value: o }, o)));
      input.value = v ?? '';
    } else if (f.type === 'multicheck') {
      const sel = new Set(Array.isArray(v) ? v : []);
      const items = f.options.map((o) => {
        const cb = h('input', { type: 'checkbox', value: o });
        cb.checked = sel.has(o);
        return h('label', { class: 'multi-item' }, cb, ' ', o);
      });
      const filter = f.options.length > 12
        ? h('input', { type: 'search', class: 'multi-filter', placeholder: 'Type to filter…', 'aria-label': `Filter ${f.label}` }) : null;
      if (filter) filter.addEventListener('input', () => {
        const q = filter.value.toLowerCase();
        items.forEach((it) => { it.hidden = !!q && !it.textContent.toLowerCase().includes(q); });
      });
      input = h('div', { class: 'multi', id, tabindex: '-1' }, filter, items);
      input.getValues = () => items.map((it) => it.firstChild).filter((c) => c.checked).map((c) => c.value);
    } else if (f.type === 'checkbox') {
      input = h('input', { id, type: 'checkbox' });
      input.checked = !!v;
    } else {
      const type = f.type === 'date' ? 'date' : f.type === 'int' ? 'number' : f.type === 'url' ? 'url' : 'text';
      input = h('input', {
        id, type, maxlength: f.max || false,
        inputmode: f.type === 'int' ? 'numeric' : f.type === 'num' ? 'decimal' : false,
        min: f.type === 'date' ? MIN_DATE : f.min ?? false,
        max: f.type === 'date' && f.noFuture ? today() : false,
        autocomplete: 'off',
      });
      input.value = v ?? '';
    }
    input.addEventListener('input', fire);
    input.addEventListener('change', fire);
    inputs[f.key] = input;

    const err = h('div', { class: 'err', role: 'alert' });
    errs[f.key] = err;
    let count = null;
    if (f.words) {
      count = h('div', { class: 'hint count' });
      const upd = () => { const n = wordCount(input.value); count.textContent = `${n} / ${f.words} words`; count.classList.toggle('over', n > f.words); };
      input.addEventListener('input', upd); upd();
    } else if (f.max && f.type === 'textarea') {
      count = h('div', { class: 'hint count' }, `${(input.value || '').length} / ${f.max}`);
      input.addEventListener('input', () => { count.textContent = `${input.value.length} / ${f.max}`; });
    }

    if (f.type === 'checkbox') {
      return h('div', { class: 'field check' }, h('label', { for: id }, input, ' ', f.label), err);
    }
    return h('div', { class: 'field' },
      h('label', { for: f.type === 'multicheck' ? false : id }, f.label, f.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
      input, f.help ? h('div', { class: 'hint' }, f.help) : null, count, err);
  }

  const el = h('div', { class: 'form' });
  for (const f of fields) { rows[f.key] = make(f); el.append(rows[f.key]); }


  function raw() {
    const out = {};
    for (const f of fields) {
      const inp = inputs[f.key];
      if (f.type === 'checkbox') out[f.key] = inp.checked;
      else if (f.type === 'multicheck') { const a = inp.getValues(); out[f.key] = a.length ? a : null; }
      else if (f.type === 'int') out[f.key] = inp.value === '' ? null : Number(inp.value);
      else if (f.type === 'num') out[f.key] = inp.value.trim() === '' ? null : Number(inp.value.trim());
      else out[f.key] = inp.value.trim() === '' ? null : inp.value.trim();
    }
    return out;
  }

  // values(): what gets saved. Hidden fields return null/false so stale answers never reach the database.
  function values() { return cleanValues(fields, raw()); }

  function refresh() {
    const r = raw();
    for (const f of fields) rows[f.key].hidden = !isVisible(f, r);
  }
  function fire() { refresh(); listeners.forEach((fn) => fn(values())); }

  function validate() {
    const errors = validateValues(fields, raw());
    for (const f of fields) {
      const msg = errors[f.key] || '';
      errs[f.key].textContent = msg;
      inputs[f.key].setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    const ok = Object.keys(errors).length === 0;
    if (!ok) {
      const first = el.querySelector('[aria-invalid="true"]');
      if (first) { first.focus(); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }
    return ok;
  }

  refresh();
  return {
    el, values, validate,
    set(key, value) { const i = inputs[key]; if (i.type === 'checkbox') i.checked = !!value; else i.value = value ?? ''; fire(); },
    input: (key) => inputs[key],
    onChange(fn) { listeners.push(fn); },
  };
}
