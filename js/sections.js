import { STATES } from './states.js';

// Each section: label, fields, and a one-line summary used in lists and in the Word export.
// Field keys that start with col: are stored in table columns (start_date, end_date); the rest go into data (jsonb).
export const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

export const SECTIONS = {
  field_visit: {
    label: 'Field visit',
    blurb: 'Visits to districts, states or outbreak sites',
    enabled: true,
    dateMode: 'range',            // blank end date = single day
    fields: [
      { key: 'start_date', col: true, type: 'date', label: 'Start date', required: true, noFuture: true },
      { key: 'end_date', col: true, type: 'date', label: 'End date', help: 'Leave blank for a single-day visit.', noFuture: true },
      { key: 'project', type: 'text', label: 'Project', required: true, max: 200 },
      { key: 'district', type: 'text', label: 'District', required: true, max: 100 },
      { key: 'state', type: 'select', label: 'State', required: true, options: STATES },
      { key: 'purpose', type: 'textarea', label: 'Purpose', required: true, max: 300 },
    ],
    summary: (e) => {
      const d = e.data || {};
      const when = e.end_date && e.end_date !== e.start_date
        ? `${fmtDate(e.start_date)}–${fmtDate(e.end_date)}` : fmtDate(e.start_date);
      return `${when}, ${d.project}, ${d.district}, ${d.state} – ${d.purpose}`;
    },
    dupKey: (e) => [e.start_date, (e.data.project || '').toLowerCase(), (e.data.district || '').toLowerCase()].join('|'),
  },
  // The sections below arrive in later stages.
  teaching:     { label: 'Teaching', blurb: 'Lectures and sessions', enabled: false },
  training:     { label: 'Training / workshop organised', blurb: 'Events run by ICMR-NIE', enabled: false },
  meeting:      { label: 'Committee and interview meetings', blurb: 'Internal committees, interviews', enabled: false },
  support:      { label: 'Programme support', blurb: 'National and state programmes, outbreak roles', enabled: false },
  policy:       { label: 'Policy contribution', blurb: 'Research that shaped policy', enabled: false },
  peer_review:  { label: 'Peer review', blurb: 'Reviewer and editor work', enabled: false },
  publication:  { label: 'Publication', blurb: 'Research and non-research outputs', enabled: false },
};

export const PROFILE_FIELDS = [
  { key: 'full_name', type: 'text', label: 'Full name', required: true, max: 120 },
  { key: 'degrees', type: 'text', label: 'Degrees', help: 'For example: MBBS, MD (Community Medicine)', max: 200 },
  { key: 'designation', type: 'text', label: 'Designation', required: true, max: 120 },
  { key: 'division', type: 'text', label: 'Division', max: 120 },
  { key: 'gender', type: 'select', label: 'Gender', options: ['Male', 'Female', 'Other'] },
  { key: 'dob', type: 'date', label: 'Date of birth', noFuture: true },
  { key: 'joining_date', type: 'date', label: 'Date of joining ICMR-NIE', required: true, noFuture: true,
    help: 'Entries dated before this day are tagged "before joining".' },
  { key: 'scholar_link', type: 'url', label: 'Google Scholar link' },
  { key: 'scholar_updated', type: 'checkbox', label: 'Google Scholar profile updated this quarter' },
  { key: 'orcid', type: 'orcid', label: 'ORCID', help: '16 digits, for example 0000-0002-1825-0097' },
  { key: 'orcid_updated', type: 'checkbox', label: 'ORCID profile updated this quarter' },
  { key: 'other_links', type: 'text', label: 'Other profile links', max: 300 },
  { key: 'i10_index', type: 'int', label: 'i10-index', min: 0 },
  { key: 'h_index', type: 'int', label: 'h-index', min: 0 },
  { key: 'academic_editor_journals', type: 'textarea', label: 'Journals where you serve as academic editor', max: 400 },
];
