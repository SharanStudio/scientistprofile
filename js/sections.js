import { STATES } from './states.js';

// Each section: label, fields, and a one-line summary used in lists and in the Word export.
// Field keys that start with col: are stored in table columns (start_date, end_date); the rest go into data (jsonb).
export const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

export const rangeText = (e) => (e.end_date && e.end_date !== e.start_date
  ? `${fmtDate(e.start_date)}–${fmtDate(e.end_date)}` : fmtDate(e.start_date));

export const SECTIONS = {
  teaching: {
    label: 'Teaching',
    blurb: 'Lectures and sessions',
    enabled: true,
    fields: [
      { key: 'start_date', col: true, type: 'date', label: 'Date', required: true, noFuture: true },
      { key: 'topic', type: 'text', label: 'Topic', required: true, max: 200 },
      { key: 'course', type: 'text', label: 'Course / cohort', required: true, max: 200 },
      { key: 'mode', type: 'select', label: 'Mode', required: true, options: ['In-person', 'Online', 'Hands-on'] },
    ],
    summary: (e) => `${fmtDate(e.start_date)}: ${e.data.topic} – ${e.data.course} (${e.data.mode})`,
    dupKey: (e) => [e.start_date, (e.data.topic || '').toLowerCase()].join('|'),
  },
  field_visit: {
    label: 'Field visit',
    blurb: 'Visits to districts, states or outbreak sites',
    enabled: true,
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
      return `${rangeText(e)}, ${d.project}, ${d.district}, ${d.state} – ${d.purpose}`;
    },
    dupKey: (e) => [e.start_date, (e.data.project || '').toLowerCase(), (e.data.district || '').toLowerCase()].join('|'),
  },
  training: {
    label: 'Training / workshop organised',
    blurb: 'Events run by ICMR-NIE',
    enabled: true,
    fields: [
      { key: 'title', type: 'text', label: 'Title', required: true, max: 250 },
      { key: 'type', type: 'select', label: 'Type', required: true, options: ['Seminar', 'Conference', 'Meeting', 'Workshop', 'Training'] },
      { key: 'level', type: 'select', label: 'Level', required: true, options: ['National', 'International'] },
      { key: 'start_date', col: true, type: 'date', label: 'Start date', required: true, noFuture: true },
      { key: 'end_date', col: true, type: 'date', label: 'End date', help: 'Leave blank for a single-day event.', noFuture: true },
      { key: 'participants', type: 'int', label: 'Number of participants', required: true, min: 1 },
    ],
    summary: (e) => `${e.data.title} (${e.data.type}, ${e.data.level}), ${rangeText(e)}, ${e.data.participants} participants`,
    dupKey: (e) => [e.start_date, (e.data.title || '').toLowerCase()].join('|'),
  },
  meeting: {
    label: 'Committee and interview meetings',
    blurb: 'Internal committees, interview panels',
    enabled: true,
    fields: [
      { key: 'kind', type: 'select', label: 'What was it?', required: true, options: ['Committee meeting', 'Interview meeting'] },
      { key: 'start_date', col: true, type: 'date', label: 'Date', required: true, noFuture: true },
      { key: 'committee', type: 'select', label: 'Committee', required: true, options: ['Media & Communications', 'Library', 'Others'],
        showIf: (v) => v.kind === 'Committee meeting' },
      { key: 'committee_other', type: 'text', label: 'Committee name', required: true, max: 200,
        showIf: (v) => v.kind === 'Committee meeting' && v.committee === 'Others' },
      { key: 'meeting_name', type: 'text', label: 'Meeting name', required: true, max: 250,
        showIf: (v) => v.kind === 'Interview meeting' },
    ],
    // name = the text printed in the Word table
    finalise: (d) => ({ ...d, name: d.kind === 'Committee meeting' ? (d.committee === 'Others' ? d.committee_other : d.committee) : d.meeting_name }),
    summary: (e) => `${fmtDate(e.start_date)}, ${e.data.name} (${e.data.kind === 'Interview meeting' ? 'interview' : 'committee'})`,
    dupKey: (e) => [e.start_date, (e.data.name || '').toLowerCase()].join('|'),
  },
  support: {
    label: 'Programme support',
    blurb: 'National and state programmes, outbreak roles',
    enabled: true,
    ongoingIfBlank: true,
    fields: [
      { key: 'kind', type: 'select', label: 'What was it?', required: true, options: ['Programme support', 'Outbreak / emergency role'] },
      // Programme support
      { key: 'programme', type: 'select', label: 'Programme', required: true, options: ['IDSP', 'NPNCD', 'Dialysis Program', 'Others'],
        showIf: (v) => v.kind === 'Programme support' },
      { key: 'programme_other', type: 'text', label: 'Programme name', required: true, max: 200,
        showIf: (v) => v.kind === 'Programme support' && v.programme === 'Others' },
      // Outbreak role
      { key: 'programme_state', type: 'text', label: 'Programme name with state', required: true, max: 250,
        help: 'For example: Cholera outbreak response, Odisha', showIf: (v) => v.kind === 'Outbreak / emergency role' },
      { key: 'level', type: 'select', label: 'Level', required: true, options: ['National', 'State'], showIf: (v) => !!v.kind },
      { key: 'states', type: 'multicheck', label: 'State(s)', required: true, options: STATES,
        help: 'Tick every state you supported.', showIf: (v) => v.kind === 'Programme support' && v.level === 'State' },
      { key: 'support_types', type: 'multicheck', label: 'Type of support', required: true,
        options: ['Outbreak Investigation', 'Surveillance System Evaluation', 'Capacity building', 'Secondary data analysis', 'Other'],
        showIf: (v) => v.kind === 'Programme support' },
      { key: 'support_other', type: 'text', label: 'Other type of support', required: true, max: 200,
        showIf: (v) => v.kind === 'Programme support' && (v.support_types || []).includes('Other') },
      { key: 'role_type', type: 'select', label: 'Type of support', required: true, options: ['FETP mentoring', 'Part of National team', 'Others'],
        showIf: (v) => v.kind === 'Outbreak / emergency role' },
      { key: 'role_other', type: 'text', label: 'Other type of support', required: true, max: 200,
        showIf: (v) => v.kind === 'Outbreak / emergency role' && v.role_type === 'Others' },
      { key: 'start_date', col: true, type: 'date', label: 'Start date', required: true, noFuture: true, showIf: (v) => !!v.kind },
      { key: 'end_date', col: true, type: 'date', label: 'End date', help: 'Leave blank if this support is ongoing.', noFuture: true, showIf: (v) => !!v.kind },
    ],
    finalise: (d) => ({
      ...d,
      name: d.kind === 'Programme support' ? (d.programme === 'Others' ? d.programme_other : d.programme) : d.programme_state,
      where: d.level === 'National' ? 'National' : d.kind === 'Programme support' ? (d.states || []).join(', ') : 'State',
    }),
    summary: (e) => {
      const d = e.data;
      const types = d.kind === 'Programme support'
        ? (d.support_types || []).map((t) => (t === 'Other' ? d.support_other : t)).join(', ')
        : (d.role_type === 'Others' ? d.role_other : d.role_type);
      const when = e.end_date ? rangeText(e) : `${fmtDate(e.start_date)}–ongoing`;
      return `${d.kind === 'Programme support' ? 'Programme' : 'Outbreak role'}: ${d.name} (${d.where}) – ${types}; ${when}`;
    },
    dupKey: (e) => [e.start_date, e.data.kind, (e.data.name || '').toLowerCase()].join('|'),
  },
  policy: {
    label: 'Policy contribution',
    blurb: 'Research that shaped policy, expert committees',
    enabled: true,
    fields: [
      { key: 'type', type: 'select', label: 'Type', required: true, options: ['Research leading to policy', 'Expert in a government committee'] },
      { key: 'title', type: 'text', label: 'Title of policy or meeting', required: true, max: 300 },
      { key: 'level', type: 'select', label: 'Level', required: true, options: ['International', 'National', 'State'] },
      { key: 'impact', type: 'textarea', label: 'Details of research, policy, or practice impact', required: true, max: 600, rows: 4 },
      { key: 'start_date', col: true, type: 'date', label: 'Date', required: true, noFuture: true },
    ],
    summary: (e) => `${fmtDate(e.start_date)}: ${e.data.title} (${e.data.type}, ${e.data.level})`,
    dupKey: (e) => [e.start_date, (e.data.title || '').toLowerCase()].join('|'),
  },
  peer_review: {
    label: 'Peer review',
    blurb: 'Reviewer and academic editor work',
    enabled: true,
    beforeJoining: true,
    fields: [
      { key: 'journal', type: 'text', label: 'Journal', required: true, max: 200 },
      { key: 'role', type: 'select', label: 'Role', required: true, options: ['Reviewer', 'Academic editor'] },
      { key: 'start_date', col: true, type: 'date', label: 'Date', required: true, noFuture: true },
    ],
    summary: (e) => `${fmtDate(e.start_date)}: ${e.data.journal} (${e.data.role})`,
    dupKey: (e) => [e.start_date, (e.data.journal || '').toLowerCase(), e.data.role].join('|'),
  },
  publication: {
    label: 'Publication',
    blurb: 'Research and non-research outputs',
    enabled: true,
    beforeJoining: true,
    fields: [
      { key: 'kind', type: 'select', label: 'What are you adding?', required: true, options: ['Research publication', 'Non-research publication'] },
      { key: 'citation', type: 'textarea', label: 'Vancouver citation', required: true, rows: 4, max: 1200, showIf: (v) => !!v.kind,
        help: 'Paste the full citation.' },
      { key: 'start_date', col: true, type: 'date', label: 'Publication date', showIf: (v) => !!v.kind, required: true,
        help: 'The issue date you want counted. It decides the financial-year and calendar-year flags.' },
      // Non-research
      { key: 'nr_type', type: 'select', label: 'Type', required: true, options: ['Book chapter', 'Guideline', 'Monograph', 'Newsletter', 'Report', 'Other'],
        showIf: (v) => v.kind === 'Non-research publication' },
      // Research
      { key: 'doi', type: 'text', label: 'DOI', max: 200, showIf: (v) => v.kind === 'Research publication',
        pattern: /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)?10\.\d{4,9}\/\S+$/i, patternMsg: 'A DOI looks like 10.1016/j.example.2025.01.001',
        norm: (x) => x.replace(/^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:\s*)/i, '') },
      { key: 'pubid', type: 'text', label: 'PMID or PMCID', max: 20, showIf: (v) => v.kind === 'Research publication',
        pattern: /^(?:\d{1,9}|PMC\d{1,9})$/i, patternMsg: 'Enter digits (PMID) or PMC followed by digits (PMCID).',
        norm: (x) => x.toUpperCase() },
      { key: 'roles', type: 'multicheck', label: 'Your role', required: true, options: ['First author', 'Corresponding author', 'Co-author'],
        showIf: (v) => v.kind === 'Research publication',
        check: (val) => (val.includes('Co-author') && val.length > 1 ? 'Choose Co-author alone, or First and/or Corresponding.' : '') },
      { key: 'journal_level', type: 'select', label: 'Journal level', required: true, options: ['National', 'International'],
        showIf: (v) => v.kind === 'Research publication' },
      { key: 'type', type: 'select', label: 'Type', required: true, options: ['Original article', 'Letter to editor', 'Review', 'Other'],
        showIf: (v) => v.kind === 'Research publication' },
      { key: 'in_pubmed', type: 'select', label: 'Available in PubMed', required: true, options: ['Yes', 'No'],
        showIf: (v) => v.kind === 'Research publication' },
      { key: 'impact_factor', type: 'num', label: 'Impact factor', maxNum: 300, showIf: (v) => v.kind === 'Research publication' },
      { key: 'link', type: 'url', label: 'Publication link', showIf: (v) => v.kind === 'Research publication' },
      { key: 'summary', type: 'textarea', label: 'Summary', required: true, words: 50, rows: 4,
        help: 'Paste your own summary, 50 words or fewer.', showIf: (v) => v.kind === 'Research publication' },
    ],
    summary: (e) => `${fmtDate(e.start_date)}: ${e.data.citation}`,
    dupKey: (e) => (e.data.doi || (e.data.citation || '').toLowerCase().slice(0, 80)),
  },
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

// Filter dropdowns shown on each section page. Options come from the entries you have saved.
const FILTERS = {
  teaching: [{ key: 'mode', label: 'Mode' }],
  field_visit: [{ key: 'state', label: 'State' }],
  training: [{ key: 'type', label: 'Type' }, { key: 'level', label: 'Level' }],
  meeting: [{ key: 'kind', label: 'Kind' }],
  support: [{ key: 'kind', label: 'Kind' }, { key: 'name', label: 'Programme' }, { key: 'level', label: 'Level' }],
  policy: [{ key: 'type', label: 'Type' }, { key: 'level', label: 'Level' }],
  peer_review: [{ key: 'role', label: 'Role' }],
  publication: [{ key: 'kind', label: 'Kind' }, { key: 'roles', label: 'Your role' }, { key: 'journal_level', label: 'Journal level' }, { key: 'type', label: 'Type' }],
};
for (const [k, v] of Object.entries(FILTERS)) SECTIONS[k].filters = v;
