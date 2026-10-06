import { h, today } from './dom.js';

const ORCID_RE = /^(?:https?:\/\/orcid\.org\/)?(\d{4}-\d{4}-\d{4}-\d{3}[\dX])$/;
const MIN_DATE = '1950-01-01';

// ORCID check digit (ISO 7064 mod 11-2)
function orcidOk(id) {
  const digits = id.replace(/-/g, '');
  let total = 0;
  for (let i = 0; i < 15; i++) total = (total + Number(digits[i])) * 2;
  const r = (12 - (total % 11)) % 11;
  return digits[15] === (r === 10 ? 'X' : String(r));
}

// Builds a form from a field list. Returns { el, values(), validate(), set(key, value), onChange(fn) }.
export function buildForm(fields, initial = {}) {
  const inputs = {};
  const errs = {};
  const rows = {};
  const listeners = [];

  const fire = () => listeners.forEach((f) => f(values()));

  function make(f) {
    const id = `f_${f.key}`;
    let input;
    const v = initial[f.key];
    if (f.type === 'textarea') {
      input = h('textarea', { id, rows: 3, maxlength: f.max || false });
      input.value = v ?? '';
    } else if (f.type === 'select') {
      input = h('select', { id }, h('option', { value: '' }, 'Select…'),
        f.options.map((o) => h('option', { value: o }, o)));
      input.value = v ?? '';
    } else if (f.type === 'checkbox') {
      input = h('input', { id, type: 'checkbox' });
      input.checked = !!v;
    } else {
      const type = f.type === 'date' ? 'date' : f.type === 'int' ? 'number' : f.type === 'url' ? 'url' : 'text';
      input = h('input', {
        id, type, maxlength: f.max || false,
        inputmode: f.type === 'int' ? 'numeric' : false,
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
    const count = f.max && (f.type === 'textarea')
      ? h('div', { class: 'hint count' }, `${(input.value || '').length} / ${f.max}`) : null;
    if (count) input.addEventListener('input', () => { count.textContent = `${input.value.length} / ${f.max}`; });

    if (f.type === 'checkbox') {
      return h('div', { class: 'field check' }, h('label', { for: id }, input, ' ', f.label), err);
    }
    return h('div', { class: 'field' },
      h('label', { for: id }, f.label, f.required ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
      input, f.help ? h('div', { class: 'hint' }, f.help) : null, count, err);
  }

  const el = h('div', { class: 'form' });
  for (const f of fields) { rows[f.key] = make(f); el.append(rows[f.key]); }

  function visible(f, vals) { return !f.showIf || f.showIf(vals); }

  function values() {
    const out = {};
    for (const f of fields) {
      const inp = inputs[f.key];
      if (f.type === 'checkbox') out[f.key] = inp.checked;
      else if (f.type === 'int') out[f.key] = inp.value === '' ? null : Number(inp.value);
      else out[f.key] = inp.value.trim() === '' ? null : inp.value.trim();
    }
    return out;
  }

  function validate() {
    const vals = values();
    let ok = true;
    for (const f of fields) {
      let msg = '';
      const val = vals[f.key];
      const empty = val === null || val === '' || val === undefined;
      if (visible(f, vals)) {
        if (f.required && empty) msg = 'This field is required.';
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
          if (f.type === 'int' && (!Number.isInteger(val) || val < (f.min ?? 0))) msg = 'Enter a whole number, zero or more.';
        }
      }
      errs[f.key].textContent = msg;
      inputs[f.key].setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (msg) ok = false;
    }
    // cross-field: end date not before start date
    const s = inputs.start_date, e = inputs.end_date;
    if (s && e && s.value && e.value && e.value < s.value) {
      errs.end_date.textContent = 'End date cannot be before the start date.';
      e.setAttribute('aria-invalid', 'true');
      ok = false;
    }
    if (!ok) {
      const first = el.querySelector('[aria-invalid="true"]');
      if (first) first.focus();
    }
    return ok;
  }

  return {
    el, values, validate,
    set(key, value) { const i = inputs[key]; if (i.type === 'checkbox') i.checked = !!value; else i.value = value ?? ''; },
    input: (key) => inputs[key],
    onChange(fn) { listeners.push(fn); },
  };
}
