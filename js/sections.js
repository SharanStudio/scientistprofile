import { STATES, STATES_WITH_NATIONAL } from './states.js';
import { today } from './dom.js';

// Each section: label, fields, and a one-line summary used in lists and in the Word export.
// Field keys that start with col: are stored in table columns (start_date, end_date); the rest go into data (jsonb).
export const fmtDate = (iso) => (iso ? iso.split('-').reverse().join('/') : '');

export const rangeText = (e) => (e.end_date && e.end_date !== e.start_date
  ? `${fmtDate(e.start_date)}–${fmtDate(e.end_date)}` : fmtDate(e.start_date));

// ---- Public website fields ----
// siteFields sit beside a section's normal fields on the entry form but stay out of `fields`, so they never reach the
// Word export or the Excel upload. is_public and is_featured are table columns; the others are saved in data.
// Nothing is public until the box is ticked. The website reads only the views in the `site` schema.
export const STATE_PROGRAMME = 'FETP Intermediate (State-specific)';
const MENTEE_PROGRAMMES = ['India EIS', 'FETP NCD Advanced', 'FETP NCD Intermediate', STATE_PROGRAMME];
const RESEARCH_AREA_FALLBACK = [
  { value: 'communicable-diseases', label: 'Communicable Diseases' },
  { value: 'noncommunicable-diseases', label: 'Noncommunicable Diseases' },
  { value: 'reproductive-child-health', label: 'Reproductive and Child Health' },
  { value: 'digital-health', label: 'Digital Health' },
  { value: 'field-epidemiology', label: 'Field Epidemiology' },
];
export const SITE_PUBLIC = { key: 'is_public', type: 'checkbox', label: 'Show on my public website',
  help: 'Off by default. Nothing appears on the website until you tick this.' };
export const SITE_FEATURED = { key: 'is_featured', type: 'checkbox', label: 'Feature on the home page', showIf: (v) => !!v.is_public };
const SITE_SUMMARY = { key: 'site_summary', type: 'textarea', label: 'Short description for the website', words: 40, rows: 2,
  help: 'Optional. One or two plain sentences, 40 words or fewer. Shown on the project card.' };
export const SITE_AREAS = { key: 'research_areas', type: 'multicheck', label: 'Research areas', optionsFrom: 'research_areas',
  options: RESEARCH_AREA_FALLBACK, help: 'Tick all that apply. The website uses these to group the work.' };
const SITE_TEAM = { key: 'team_id', type: 'select', label: 'Team', optionsFrom: 'teams',
  help: 'The one team that owns this work. Teams are managed in Supabase.' };
const SITE_STATES = { key: 'states', type: 'multicheck', label: 'States covered', options: STATES_WITH_NATIONAL,
  help: 'Tick every state. National (Pan-India) covers the whole country and does not count as a state in the website numbers.' };

// Achievements: one form, six kinds. The first four are personal honours (website, and the Word "Awards" table for
// "Award" only). The last two feed two Word tables that used to have their own sections. profile-data.js uses the
// same kind names as plain strings, so keep the two files in step.
const HONOUR_KINDS = ['Award', 'Fellowship or grant', 'Invited talk or keynote', 'Role or appointment'];
const KIND_RECOGNITION = 'Institutional recognition';
const KIND_FINDING = 'Notable research finding';
const isHonour = (v) => HONOUR_KINDS.includes(v.category);
const isFinding = (v) => v.category === KIND_FINDING;
const hasDetails = (v) => v.category === KIND_RECOGNITION || v.category === KIND_FINDING;

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
  mentee: {
    label: 'Mentee details',
    blurb: 'Officers and scholars you mentor',
    enabled: true,
    fields: [
      { key: 'name', type: 'text', label: 'Name', required: true, max: 120 },
      { key: 'designation', type: 'text', label: 'Current designation', required: true, max: 150 },
      { key: 'organisation', type: 'text', label: 'Current organisation', required: true, max: 200 },
      { key: 'program', type: 'select', label: 'Programme', required: true, optionsFrom: 'mentee_programs', options: MENTEE_PROGRAMMES },
      { key: 'state', type: 'select', label: 'State', options: STATES_WITH_NATIONAL,
        requiredIf: (v) => v.program === STATE_PROGRAMME,
        help: 'Required for the state-specific FETP. Choose National (Pan-India) for national-level work.' },
      { key: 'cohort', type: 'text', label: 'Cohort (optional)', max: 60 },
      { key: 'linkedin', type: 'url', label: 'LinkedIn page (optional)' },
      { key: 'email', type: 'text', label: 'Email (optional)', max: 150,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, patternMsg: 'Enter a valid email address.',
        help: 'Private. It never appears on the website.' },
      { key: 'public_consent', type: 'checkbox', label: 'This mentee has agreed to be named on my public website',
        help: 'Without consent the mentee still counts in "officers mentored", but the name stays off the site.' },
    ],
    siteFields: [SITE_PUBLIC],
    summary: (e) => `${e.data.name}, ${e.data.designation}, ${e.data.organisation} (${e.data.program}${e.data.state ? `, ${e.data.state}` : ''})`,
    dupKey: (e) => [(e.data.name || '').toLowerCase(), (e.data.organisation || '').toLowerCase()].join('|'),
  },
  field_visit: {
    label: 'Field visits',
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
    label: 'Training conducted',
    blurb: 'Seminars, workshops and trainings run by ICMR-NIE',
    enabled: true,
    fields: [
      { key: 'title', type: 'text', label: 'Title', required: true, max: 250 },
      { key: 'type', type: 'select', label: 'Type', required: true, options: ['Seminar', 'Conference', 'Meeting', 'Workshop', 'Training'] },
      { key: 'level', type: 'select', label: 'Level', required: true, options: ['National', 'Regional', 'International'] },
      { key: 'start_date', col: true, type: 'date', label: 'Start date', required: true, noFuture: true },
      { key: 'end_date', col: true, type: 'date', label: 'End date', help: 'Leave blank for a single-day event.', noFuture: true },
      { key: 'participants', type: 'int', label: 'Number of participants', required: true, min: 1 },
    ],
    // No website fields: trainings stay off the public site. They appear only in the Word profile.
    summary: (e) => `${e.data.title} (${e.data.type}, ${e.data.level}), ${rangeText(e)}, ${e.data.participants} participants`,
    dupKey: (e) => [e.start_date, (e.data.title || '').toLowerCase()].join('|'),
  },
  meeting: {
    label: 'Meetings and trainings attended',
    blurb: 'Committee and interview meetings, trainings you attended',
    enabled: true,
    fields: [
      { key: 'kind', type: 'select', label: 'What was it?', required: true, options: ['Committee meeting', 'Interview meeting', 'Training attended'] },
      { key: 'start_date', col: true, type: 'date', label: 'Date', required: true, noFuture: true,
        help: 'For a training that ran over several days, the first day.' },
      { key: 'end_date', col: true, type: 'date', label: 'End date', showIf: (v) => v.kind === 'Training attended',
        help: 'Leave blank for a one-day training.' },
      { key: 'committee', type: 'select', label: 'Committee', required: true, options: ['Media & Communications', 'Library', 'Others'],
        showIf: (v) => v.kind === 'Committee meeting' },
      { key: 'committee_other', type: 'text', label: 'Committee name', required: true, max: 200,
        showIf: (v) => v.kind === 'Committee meeting' && v.committee === 'Others' },
      { key: 'meeting_name', type: 'text', label: 'Meeting name', required: true, max: 250,
        showIf: (v) => v.kind === 'Interview meeting' },
      { key: 'training_name', type: 'text', label: 'Training name', required: true, max: 250,
        showIf: (v) => v.kind === 'Training attended' },
    ],
    // name = the text printed in the Word table. Trainings attended have no Word table yet, so they are stored only.
    finalise: (d) => ({
      ...d,
      name: d.kind === 'Committee meeting' ? (d.committee === 'Others' ? d.committee_other : d.committee)
        : d.kind === 'Interview meeting' ? d.meeting_name : d.training_name,
    }),
    summary: (e) => `${rangeText(e)}, ${e.data.name} (${e.data.kind === 'Interview meeting' ? 'interview' : e.data.kind === 'Training attended' ? 'training attended' : 'committee'})`,
    dupKey: (e) => [e.start_date, (e.data.name || '').toLowerCase()].join('|'),
  },
  support: {
    label: 'Programme and outbreak support',
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
    siteFields: [
      { ...SITE_PUBLIC, help: 'Off by default. Shown on: the Recognitions page of the website.' },
      { ...SITE_FEATURED, help: 'Also shown on: the home page, under Awards, fellowships and policy work.' },
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
    label: 'Publications',
    blurb: 'Research and non-research outputs',
    enabled: true,
    beforeJoining: true,
    fields: [
      { key: 'kind', type: 'select', label: 'What are you adding?', required: true, options: ['Research publication', 'Non-research publication'] },
      { key: 'title', type: 'text', label: 'Title of the publication', required: true, max: 400, showIf: (v) => !!v.kind,
        help: 'The title as printed. It shows in the Publications list.' },
      { key: 'journal_name', type: 'text', label: 'Journal name', required: true, max: 200, showIf: (v) => v.kind === 'Research publication' },
      { key: 'citation', type: 'textarea', label: 'Vancouver citation', required: true, rows: 4, max: 1200, showIf: (v) => !!v.kind,
        help: 'Paste the full citation.' },
      { key: 'start_date', col: true, type: 'date', label: 'Publication date', showIf: (v) => !!v.kind, required: true,
        help: 'The issue date you want counted. It decides the financial-year and calendar-year flags.' },
      // Non-research
      { key: 'nr_type', type: 'select', label: 'Type', required: true, options: ['Book chapter', 'Guideline', 'Monograph', 'Newsletter', 'Report', 'Other'],
        showIf: (v) => v.kind === 'Non-research publication' },
      // Research
      { key: 'doi', type: 'text', label: 'DOI', requiredIf: (v) => v.kind === 'Research publication', max: 200, showIf: (v) => !!v.kind,
        help: 'Required for research publications. Optional for non-research items.',
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
      { key: 'link', type: 'url', label: 'Publication link', requiredIf: (v) => v.kind === 'Research publication', showIf: (v) => !!v.kind,
        help: 'Required for research publications. Optional for non-research items. Start with https://' },
      { key: 'summary', type: 'textarea', label: 'Summary', required: true, words: 50, rows: 4,
        help: 'Paste your own summary, 50 words or fewer.', showIf: (v) => v.kind === 'Research publication' },
    ],
    siteFields: [SITE_AREAS, SITE_TEAM, SITE_PUBLIC, SITE_FEATURED],
    summary: (e) => `${fmtDate(e.start_date)}: ${e.data.citation}`,
    dupKey: (e) => (e.data.doi || (e.data.citation || '').toLowerCase().slice(0, 80)),
  },
  project: {
    label: 'Project details',
    blurb: 'As PI / joint PI or co-investigator',
    enabled: true,
    ongoingFrom: (d) => d.status === 'Ongoing',
    fields: [
      { key: 'role', type: 'select', label: 'Your role', required: true, options: ['PI / joint PI', 'Co-investigator'] },
      { key: 'name', type: 'textarea', label: 'Name of the project', required: true, rows: 2, max: 400 },
      { key: 'type', type: 'select', label: 'Funding type', required: true, options: ['Intramural', 'Extramural national', 'Extramural international'] },
      { key: 'collab', type: 'textarea', label: 'Collaborating institutes / organizations / programs', rows: 2, max: 300 },
      { key: 'area', type: 'select', label: 'Priority area', required: true, options: ['Communicable disease', 'NCD', 'Mental health', 'Child health', 'Others'] },
      { key: 'area_other', type: 'text', label: 'Name of the priority area', required: true, max: 120, showIf: (v) => v.area === 'Others' },
      { key: 'multi', type: 'select', label: 'Multi-centre study', required: true, options: ['Yes', 'No'] },
      { key: 'funder', type: 'text', label: 'Funder name', required: true, max: 250 },
      { key: 'total', type: 'text', label: 'Total project funding (INR)', required: true, max: 20,
        help: 'Amount in rupees, for example 1691500 or 16,91,500.',
        pattern: /^[₹\s]*\d[\d,\s]*$/, patternMsg: 'Enter the amount in rupees, using digits only.',
        norm: (x) => x.replace(/\D/g, '') },
      { key: 'status', type: 'select', label: 'Status', required: true, options: ['Ongoing', 'Completed'] },
      { key: 'start_date', col: true, type: 'date', label: 'Start date', required: true, noFuture: true },
      { key: 'end_date', col: true, type: 'date', label: 'End date',
        requiredIf: (v) => v.status === 'Completed',
        help: 'Completed: the actual end date (required). Ongoing: the expected end date, if known.',
        check: (val, v) => (v.status === 'Completed' && val > today() ? 'A completed project cannot end in the future.' : '') },
    ],
    siteFields: [SITE_AREAS, SITE_STATES, SITE_TEAM, SITE_SUMMARY, SITE_PUBLIC],
    finalise: (d) => ({ ...d, area_name: d.area === 'Others' ? d.area_other : d.area }),
    summary: (e) => {
      const d = e.data;
      const status = d.status || (e.ongoing ? 'Ongoing' : 'Completed');
      const when = status === 'Ongoing'
        ? `ongoing since ${fmtDate(e.start_date)}${e.end_date ? ` (expected end ${fmtDate(e.end_date)})` : ''}`
        : `completed, ${fmtDate(e.start_date)}–${fmtDate(e.end_date)}`;
      return `${d.role === 'Co-investigator' ? 'Co-I' : 'PI'}: ${d.name} – ${d.funder} (${d.type}), ₹ ${Number(d.total || 0).toLocaleString('en-IN')}; ${when}`;
    },
    dupKey: (e) => (e.data.name || '').toLowerCase().slice(0, 80),
  },
  // Retired: now the "Institutional recognition" kind under Achievements. Kept hidden so any row saved here earlier
  // still opens, lists and reports.
  recognition: {
    label: 'Recognition (old)',
    blurb: 'International standing, WHO centres, accreditations',
    enabled: false,
    fields: [
      { key: 'details', type: 'textarea', label: 'Details', required: true, rows: 3, max: 600 },
      { key: 'start_date', col: true, type: 'date', label: 'Date received', required: true, noFuture: true },
    ],
    summary: (e) => `${fmtDate(e.start_date)}: ${e.data.details}`,
    dupKey: (e) => [e.start_date, (e.data.details || '').toLowerCase().slice(0, 60)].join('|'),
  },
  award: {
    label: 'Achievements',
    blurb: 'Awards, honours, recognition, notable research findings',
    enabled: true,
    // A research finding with no end date is still continuing, so it counts up to the report date.
    ongoingFrom: (d, end) => isFinding(d) && !end,
    fields: [
      { key: 'category', type: 'select', label: 'Kind', required: true,
        options: [...HONOUR_KINDS, KIND_RECOGNITION, KIND_FINDING],
        help: 'Word profile: "Award" goes to Awards and honours, "Institutional recognition" to International standing and recognition, and "Notable research finding" to Notable contributions in research. The other kinds are for the website only.' },
      { key: 'name', type: 'text', label: 'Title', required: true, max: 300,
        help: 'The name of the award, or a short title for the recognition or finding.' },
      { key: 'awarding_body', type: 'text', label: 'Awarding body', required: true, max: 250,
        help: 'For example: CDC, ICMR-NIE.', showIf: isHonour },
      { key: 'level', type: 'select', label: 'Level', required: true, options: ['Institute', 'National', 'International'], showIf: isHonour },
      { key: 'details', type: 'textarea', label: 'Details', required: true, rows: 5, max: 1200, showIf: hasDetails,
        help: 'Institutional recognition: what was recognised and by whom (for example a WHO collaborating centre). Notable research finding: the key findings from key studies or projects you led.' },
      { key: 'start_date', col: true, type: 'date', label: 'Date', required: true, noFuture: true,
        help: 'The date received. For a notable research finding, the date the work began.' },
      { key: 'end_date', col: true, type: 'date', label: 'End date', showIf: isFinding,
        help: 'Leave blank if the contribution is continuing.' },
      { key: 'description', type: 'textarea', label: 'Short description for the website (optional)', rows: 3, max: 300 },
      { key: 'link', type: 'url', label: 'Link (optional)', help: 'A page that announces or confirms it.' },
      { key: 'certificate_path', type: 'text', label: 'Certificate file (optional)', max: 200, showIf: isHonour,
        help: 'The file path inside the website assets folder, for example assets/certificates/cdc-2025.pdf',
        pattern: /^(?![/.])(?!.*\.\.)[\w\-./]+\.(?:pdf|png|jpe?g|webp)$/i,
        patternMsg: 'Use a relative path ending in .pdf, .png, .jpg or .webp, for example assets/certificates/cdc-2025.pdf' },
    ],
    siteFields: [
      { ...SITE_PUBLIC, help: 'Off by default. Shown on: the Recognitions page of the website.' },
      { ...SITE_FEATURED, help: 'Also shown on: the home page, under Awards, fellowships and policy work.' },
    ],
    summary: (e) => `${fmtDate(e.start_date)}: ${e.data.name} (${e.data.level || e.data.category})`,
    dupKey: (e) => [e.start_date, (e.data.name || '').toLowerCase()].join('|'),
  },
  // Retired: now the "Notable research finding" kind under Achievements (see the note on Recognition above).
  notable: {
    label: 'Notable contributions (old)',
    blurb: 'Key findings from studies you led',
    enabled: false,
    ongoingIfBlank: true,
    fields: [
      { key: 'details', type: 'textarea', label: 'Details', required: true, rows: 6, max: 1200,
        help: 'Key findings from key studies or projects you led.' },
      { key: 'start_date', col: true, type: 'date', label: 'Start date', required: true, noFuture: true },
      { key: 'end_date', col: true, type: 'date', label: 'End date', help: 'Leave blank if the contribution is continuing.' },
    ],
    summary: (e) => `${e.end_date ? `${fmtDate(e.start_date)}–${fmtDate(e.end_date)}` : `From ${fmtDate(e.start_date)}`}: ${e.data.details}`,
    dupKey: (e) => [e.start_date, (e.data.details || '').toLowerCase().slice(0, 60)].join('|'),
  },
  innovation: {
    label: 'Innovations and patents',
    blurb: 'Technologies, products, patents',
    enabled: true,
    ongoingIfBlank: true,
    fields: [
      { key: 'name', type: 'text', label: 'Name of the technology / product', required: true, max: 300 },
      { key: 'area', type: 'text', label: 'Area', required: true, max: 200 },
      { key: 'patent', type: 'select', label: 'Patent status', required: true, options: ['Not filed', 'Filed', 'Under process', 'Granted'] },
      { key: 'tech', type: 'text', label: 'Tech transfer / commercialised (company name)', max: 250,
        help: 'Leave blank if it is not commercialised.' },
      { key: 'start_date', col: true, type: 'date', label: 'Start date', required: true, noFuture: true },
      { key: 'end_date', col: true, type: 'date', label: 'End date', help: 'Leave blank if the work is continuing.' },
    ],
    summary: (e) => `${e.data.name} (${e.data.area}) – patent: ${e.data.patent}${e.data.tech ? `; ${e.data.tech}` : ''}`,
    dupKey: (e) => (e.data.name || '').toLowerCase(),
  },
  service: {
    label: 'Services provided',
    blurb: 'Technology validation, diagnostics, clinical support',
    enabled: true,
    fields: [
      { key: 'kind', type: 'select', label: 'What was it?', required: true, options: ['Validation of technology', 'Diagnostics', 'Clinical support'] },
      { key: 'tech_name', type: 'text', label: 'Name of the technology', required: true, max: 250, showIf: (v) => v.kind === 'Validation of technology' },
      { key: 'tech_area', type: 'text', label: 'Area', required: true, max: 200, showIf: (v) => v.kind === 'Validation of technology' },
      { key: 'firm', type: 'text', label: 'Firm / company', required: true, max: 250, showIf: (v) => v.kind === 'Validation of technology' },
      { key: 'dx_condition', type: 'text', label: 'Name of the disease / health condition', required: true, max: 250, showIf: (v) => v.kind === 'Diagnostics' },
      { key: 'dx_test', type: 'text', label: 'Type of testing', required: true, max: 250, showIf: (v) => v.kind === 'Diagnostics' },
      { key: 'dx_samples', type: 'int', label: 'Number of samples', required: true, min: 0, showIf: (v) => v.kind === 'Diagnostics' },
      { key: 'cs_condition', type: 'text', label: 'Name of the disease / health condition', required: true, max: 250, showIf: (v) => v.kind === 'Clinical support' },
      { key: 'cs_support', type: 'text', label: 'Type of support', required: true, max: 250, showIf: (v) => v.kind === 'Clinical support' },
      { key: 'cs_patients', type: 'int', label: 'Number of patients', required: true, min: 0, showIf: (v) => v.kind === 'Clinical support' },
      { key: 'start_date', col: true, type: 'date', label: 'Start date', required: true, noFuture: true, showIf: (v) => !!v.kind },
      { key: 'end_date', col: true, type: 'date', label: 'End date', help: 'Leave blank for a single day.', noFuture: true, showIf: (v) => !!v.kind },
    ],
    finalise: (d) => ({
      ...d,
      name: d.kind === 'Validation of technology' ? d.tech_name : d.kind === 'Diagnostics' ? d.dx_condition : d.cs_condition,
    }),
    summary: (e) => `${rangeText(e)}: ${e.data.kind} – ${e.data.name}`,
    dupKey: (e) => [e.start_date, e.data.kind, (e.data.name || '').toLowerCase()].join('|'),
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
  project: [{ key: 'role', label: 'Your role' }, { key: 'status', label: 'Status' }, { key: 'type', label: 'Funding type' }, { key: 'area_name', label: 'Priority area' }, { key: 'multi', label: 'Multi-centre' }],
  award: [{ key: 'category', label: 'Kind' }, { key: 'level', label: 'Level' }],
  mentee: [{ key: 'program', label: 'Programme' }, { key: 'state', label: 'State' }],
  innovation: [{ key: 'patent', label: 'Patent status' }],
  service: [{ key: 'kind', label: 'Kind' }],
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

// Home-screen layout, in display order. A key is a section; 'summaries' and 'team' are pages that are not sections.
// `others` tiles sit in a collapsed "Others (less used)" box. An enabled section missing from every list falls into the
// Output "Others" box, so a new section never vanishes from the home screen.
export const HOME_GROUPS = [
  { name: 'Activities', keys: ['teaching', 'training', 'field_visit', 'meeting', 'support'] },
  { name: 'Projects & team', keys: ['project', 'team', 'summaries'] },
  { name: 'Output', keys: ['publication', 'award', 'policy'], others: ['innovation', 'service', 'peer_review'] },
  { name: 'Mentoring', keys: ['mentee'] },
];
