import { fmtDate, rangeText } from './sections.js';

// Table columns for each section list. Every table starts with a Date column and ends with the website state
// (added by the list view), so these arrays hold only the middle columns. A section without an entry here falls
// back to one "Entry" column that shows its one-line summary.
const v = (x) => (x == null || x === '' ? '–' : String(x));
const join = (...parts) => parts.filter((p) => p != null && p !== '').join(', ') || '–';

export const COLUMNS = {
  teaching: [
    { label: 'Topic', primary: true, get: (e) => v(e.data.topic) },
    { label: 'Course or cohort', get: (e) => v(e.data.course) },
    { label: 'Mode', get: (e) => v(e.data.mode) },
  ],
  mentee: [
    { label: 'Name', primary: true, get: (e) => join(e.data.name, e.data.designation) },
    { label: 'Organisation', get: (e) => v(e.data.organisation) },
    { label: 'Programme', get: (e) => join(e.data.program, e.data.state) },
  ],
  field_visit: [
    { label: 'Project', primary: true, get: (e) => v(e.data.project) },
    { label: 'Place', get: (e) => join(e.data.district, e.data.state) },
    { label: 'Purpose', get: (e) => v(e.data.purpose) },
  ],
  training: [
    { label: 'Title', primary: true, get: (e) => v(e.data.title) },
    { label: 'Type', get: (e) => v(e.data.type) },
    { label: 'Level', get: (e) => v(e.data.level) },
    { label: 'Participants', get: (e) => v(e.data.participants) },
  ],
  meeting: [
    { label: 'Name', primary: true, get: (e) => v(e.data.name) },
    { label: 'Kind', get: (e) => v(e.data.kind) },
  ],
  support: [
    { label: 'Name', primary: true, get: (e) => v(e.data.name) },
    { label: 'Kind', get: (e) => v(e.data.kind) },
    { label: 'Where', get: (e) => v(e.data.where) },
  ],
  policy: [
    { label: 'Title', primary: true, get: (e) => v(e.data.title) },
    { label: 'Type', get: (e) => v(e.data.type) },
    { label: 'Level', get: (e) => v(e.data.level) },
  ],
  peer_review: [
    { label: 'Journal', primary: true, get: (e) => v(e.data.journal) },
    { label: 'Role', get: (e) => v(e.data.role) },
  ],
  publication: [
    { label: 'Citation', primary: true, get: (e) => v(e.data.citation) },
    { label: 'Kind', get: (e) => v(e.data.kind) },
    { label: 'Level', get: (e) => v(e.data.journal_level) },
  ],
  project: [
    { label: 'Project', primary: true, get: (e) => v(e.data.name) },
    { label: 'Role', get: (e) => (e.data.role === 'Co-investigator' ? 'Co-I' : 'PI') },
    { label: 'Funder', get: (e) => v(e.data.funder) },
    { label: 'Status', get: (e) => v(e.data.status || (e.ongoing ? 'Ongoing' : 'Completed')) },
  ],
  award: [
    { label: 'Title', primary: true, get: (e) => v(e.data.name || e.data.details) },
    { label: 'Kind', get: (e) => v(e.data.category) },
    { label: 'Level', get: (e) => v(e.data.level) },
  ],
  innovation: [
    { label: 'Name', primary: true, get: (e) => v(e.data.name) },
    { label: 'Area', get: (e) => v(e.data.area) },
    { label: 'Patent', get: (e) => v(e.data.patent) },
  ],
  service: [
    { label: 'Name', primary: true, get: (e) => v(e.data.tech_name || e.data.name) },
    { label: 'Kind', get: (e) => v(e.data.kind) },
  ],
};

export const dateCell = (e) => {
  if (!e.start_date) return '–';
  if (e.ongoing && !e.end_date) return `${fmtDate(e.start_date)} –`;
  return rangeText(e);
};

// Used when a section has no columns above: the whole summary line in one cell.
export const fallbackColumns = (sec) => [{ label: 'Entry', primary: true, get: (e) => sec.summary(e) }];
