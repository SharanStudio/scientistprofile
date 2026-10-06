import { h, today } from './dom.js';

const ORCID_RE = /^(?:https?:\/\/orcid\.org\/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$/;
const MIN_DATE = '1950-01-01';
const wordCount = (t) => (t.trim() ? t.trim().split(/\s+/).length : 0);

// ORCID check digit (ISO 7064 mod 11-2)
function orcidOk(id) {
  const digits = id.replace(/-/g, '');
  let total = 0;
  for (let i = 0; i < 15; i++) total = (total + Number(digits[i])) * 2;
  const r = (12 - (total % 11)) % 11;
  return digits[15] === (r === 10 ? 'X' : String(r));
}

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

  const isVisible = (f, vals) => !f.showIf || !!f.showIf(vals);

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
  function values() {
    const r = raw();
    const out = {};
    for (const f of fields) {
      if (!isVisible(f, r)) { out[f.key] = f.type === 'checkbox' ? false : null; continue; }
      const val = r[f.key];
      out[f.key] = val !== null && f.norm ? f.norm(val) : val;
    }
    return out;
  }

  function refresh() {
    const r = raw();
    for (const f of fields) rows[f.key].hidden = !isVisible(f, r);
  }
  function fire() { refresh(); listeners.forEach((fn) => fn(values())); }

  function validate() {
    const vals = raw();
    let ok = true;
    for (const f of fields) {
      let msg = '';
      const val = vals[f.key];
      const empty = val === null || val === '' || val === undefined || (f.type === 'checkbox' && false);
      if (isVisible(f, vals)) {
        if (f.required && empty) msg = f.type === 'multicheck' || f.type === 'select' ? 'Choose an option.' : 'This field is required.';
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
      errs[f.key].textContent = msg;
      inputs[f.key].setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (msg) ok = false;
    }
    const s = inputs.start_date, e = inputs.end_date;
    if (s && e && !rows.end_date.hidden && s.value && e.value && e.value < s.value) {
      errs.end_date.textContent = 'End date cannot be before the start date.';
      e.setAttribute('aria-invalid', 'true');
      ok = false;
    }
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
