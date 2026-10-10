import { h } from './dom.js';
import { buildForm } from './forms.js';

// The owner's public-website settings. One row in site_settings, editable only by the site owner (row-level security).
// Lists are typed one per line so the form needs no special widgets.

const lines = (t) => String(t || '').split('\n').map((x) => x.trim()).filter(Boolean);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const parseLines = lines;
export const parseEducation = (t) => lines(t).map((l) => {
  const [degree = '', institution = '', year = ''] = l.split('|').map((x) => x.trim());
  return { degree, institution, year };
});
export const educationText = (list) => (list || []).map((e) => [e.degree, e.institution, e.year].filter((x) => x != null).join(' | ')).join('\n');

export const WEBSITE_FIELDS = [
  { key: 'greeting', type: 'text', label: 'Greeting', max: 60, help: 'The small line above your name, such as "Hello, I am".' },
  { key: 'name', type: 'text', label: 'Name on the website', required: true, max: 120 },
  { key: 'subline', type: 'text', label: 'Subline under your name', max: 200, help: 'For example your designation and institute.' },
  { key: 'focus_areas', type: 'textarea', label: 'Focus areas', rows: 4, max: 600, help: 'One per line. Shown as chips on the home page.',
    check: (v) => (lines(v).length > 8 ? 'Keep this to 8 lines or fewer.' : '') },
  { key: 'portrait_path', type: 'text', label: 'Portrait file', max: 200, pattern: /^[\w\-./]+$/, patternMsg: 'Use a file path such as assets/portrait.jpg, with no spaces.',
    help: 'The path of your photo inside the website repository.' },
  { key: 'about_text', type: 'textarea', label: 'About', rows: 7, max: 2500 },
  { key: 'education', type: 'textarea', label: 'Education', rows: 4, max: 1500,
    help: 'One per line, as: Degree | Institution | Year',
    check: (v) => (lines(v).some((l) => l.split('|').length > 3) ? 'Use at most two "|" separators per line.' : '') },
  { key: 'contact_emails', type: 'textarea', label: 'Contact emails', rows: 3, max: 400, help: 'One per line. These show on the Collaborate page.',
    check: (v) => (lines(v).every((l) => EMAIL.test(l)) ? '' : 'Each line must be a valid email address.') },
  { key: 'linkedin_url', type: 'url', label: 'LinkedIn page' },
  { key: 'x_url', type: 'url', label: 'X (Twitter) page' },
  { key: 'instagram_url', type: 'url', label: 'Instagram page' },
];

export function toRow(v) {
  const t = (x) => (x == null || String(x).trim() === '' ? null : String(x).trim());
  return {
    greeting: t(v.greeting), name: t(v.name), subline: t(v.subline), focus_areas: lines(v.focus_areas),
    portrait_path: t(v.portrait_path), about_text: t(v.about_text), education: parseEducation(v.education),
    contact_emails: lines(v.contact_emails), linkedin_url: t(v.linkedin_url), x_url: t(v.x_url), instagram_url: t(v.instagram_url),
  };
}

export async function viewWebsite({ sb, shell, loadingShell, friendly, setFlash, state }) {
  if (!state.isOwner) return shell('Website', h('div', { class: 'flash warn' }, 'The website settings belong to the site owner.'));
  loadingShell('Website');
  const { data, error } = await sb.from('site_settings').select('*').limit(1).maybeSingle();
  if (error || !data) return shell('Website', h('div', { class: 'flash error' }, error ? friendly(error) : 'No website settings found.'));
  const initial = { ...data, focus_areas: (data.focus_areas || []).join('\n'), education: educationText(data.education),
    contact_emails: (data.contact_emails || []).join('\n') };
  const form = buildForm(WEBSITE_FIELDS, initial);
  const btn = h('button', { class: 'primary' }, 'Save website settings');
  btn.addEventListener('click', async () => {
    if (!form.validate()) return;
    btn.disabled = true;
    const { error: err } = await sb.from('site_settings').update(toRow(form.values())).eq('id', data.id);
    btn.disabled = false;
    if (err) setFlash('error', friendly(err)); else setFlash('ok', 'Website settings saved. The site picks them up at its next rebuild.');
    return viewWebsite({ sb, shell, loadingShell, friendly, setFlash, state });
  });
  shell('Website', h('p', { class: 'lede' }, 'These details build the hero, about, education and Collaborate pages of your public website.'),
    form.el, h('div', { class: 'actions' }, btn));
}
