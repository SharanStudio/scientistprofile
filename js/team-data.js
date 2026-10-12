// Field lists and row builders for the Team details page. Pure functions only (no page or database calls),
// so they can be tested in Node. The page itself is js/team.js.
//
// Tables (all writable only by an admin, enforced by row-level security):
//   teams            name, slug, tagline, mission, lead_person_id, image_path, is_featured, is_public, sort_order
//   people           full_name, slug, designation, bio, photo_path, photo_consent, orcid, linkedin_url, public_email, is_public, sort_order
//   team_memberships team_id, person_id, role, start_date, end_date (blank end date = current member)
// The website reads only the `site` views, which show public rows. A person's photo shows only with photo_consent.

export const ROLES = ['Team Lead', 'Team Member', 'Intern', 'Collaborator', 'Other'];
export const NEW_PERSON = '__new';

const IMAGE_PATH = /^(?![/.])(?!.*\.\.)[\w\-./]+\.(?:png|jpe?g|webp)$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const t = (x) => (x == null || String(x).trim() === '' ? null : String(x).trim());

const SORT_ORDER = { key: 'sort_order', type: 'int', label: 'Display order', min: 0,
  help: 'Lower numbers show first. Leave blank or 0 to sort by name.' };

// people: [{ value: id, label: name }]
export function teamFields(people = []) {
  return [
    { key: 'name', type: 'text', label: 'Team name', required: true, max: 120 },
    { key: 'tagline', type: 'text', label: 'Tagline', max: 100, help: 'One short line under the name. 100 characters or fewer.' },
    { key: 'mission', type: 'textarea', label: 'Mission', required: true, words: 60, rows: 3,
      help: 'What the team does, in 60 words or fewer.' },
    { key: 'lead_person_id', type: 'select', label: 'Team lead', options: people,
      help: people.length ? 'Pick from the People tab. Add the lead as a member below too.' : 'No people yet. Add people first, then pick the lead here.' },
    { key: 'image_path', type: 'text', label: 'Image file path (optional)', max: 200, pattern: IMAGE_PATH,
      patternMsg: 'Use a relative path ending in .png, .jpg or .webp, for example assets/teams/adarv.jpg',
      help: 'The file path inside the website assets folder, for example assets/teams/adarv.jpg' },
    { key: 'is_public', type: 'checkbox', label: 'Show on public website',
      help: 'Off by default. The team does not appear on the website until you tick this.' },
    { key: 'is_featured', type: 'checkbox', label: 'Feature on the home page', showIf: (v) => !!v.is_public },
    SORT_ORDER,
  ];
}

export function personFields() {
  return [
    { key: 'full_name', type: 'text', label: 'Full name', required: true, max: 120 },
    { key: 'designation', type: 'text', label: 'Designation', required: true, max: 150 },
    { key: 'bio', type: 'textarea', label: 'Short bio', words: 80, rows: 3, help: '80 words or fewer.' },
    { key: 'photo_path', type: 'text', label: 'Photo file path (optional)', max: 200, pattern: IMAGE_PATH,
      patternMsg: 'Use a relative path ending in .png, .jpg or .webp, for example assets/people/name.jpg',
      help: 'The file path inside the website assets folder, for example assets/people/name.jpg' },
    { key: 'photo_consent', type: 'checkbox', label: 'This person agreed to show their photo', showIf: (v) => !!v.photo_path,
      help: 'The photo stays hidden on the website unless this is ticked.' },
    { key: 'orcid', type: 'orcid', label: 'ORCID (optional)', help: '16 digits, for example 0000-0002-1825-0097',
      norm: (x) => x.replace(/^https?:\/\/orcid\.org\//, '') },
    { key: 'linkedin_url', type: 'url', label: 'LinkedIn page (optional)' },
    { key: 'public_email', type: 'text', label: 'Public email (optional)', max: 150,
      help: 'Shown on the website if you tick "Show on public website". Leave blank to keep it private.',
      check: (v) => (EMAIL.test(v) ? '' : 'Enter a valid email address.') },
    { key: 'is_public', type: 'checkbox', label: 'Show on public website',
      help: 'Off by default. A person appears on the website only when this is ticked and they belong to a public team.' },
    SORT_ORDER,
  ];
}

// people: [{ value: id, label: name }]. editing = true hides the person fields (a membership keeps its person).
export function memberFields(people = [], editing = false) {
  const fresh = (v) => v.person_id === NEW_PERSON;
  return [
    ...(editing ? [] : [
      { key: 'person_id', type: 'select', label: 'Person', required: true,
        options: [...people, { value: NEW_PERSON, label: '＋ New person…' }] },
      { key: 'new_name', type: 'text', label: 'New person: full name', required: true, max: 120, showIf: fresh },
      { key: 'new_designation', type: 'text', label: 'New person: designation', required: true, max: 150, showIf: fresh,
        help: 'The person starts as private. Complete their details later on the People tab.' },
    ]),
    { key: 'role', type: 'select', label: 'Role', required: true, options: ROLES },
    { key: 'role_other', type: 'text', label: 'Describe the role', required: true, max: 80, showIf: (v) => v.role === 'Other' },
    { key: 'start_date', col: true, type: 'date', label: 'Start date', required: true, noFuture: true },
    { key: 'end_date', col: true, type: 'date', label: 'End date', noFuture: true, help: 'Leave blank while the person is a current member.' },
  ];
}

// ---- roles: the database stores one text; the form splits "Other" into a dropdown value plus free text ----
export const roleFromForm = (v) => (v.role === 'Other' ? t(v.role_other) : v.role);
export const roleToForm = (role) => (ROLES.includes(role) && role !== 'Other'
  ? { role, role_other: null } : { role: 'Other', role_other: role || null });

// ---- slugs: a stable web address made from the name. Set once on creation, never changed on edit ----
export function slugify(name) {
  const s = String(name || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
  return s || 'item';
}
export function uniqueSlug(base, taken) {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) { const c = `${base}-${i}`; if (!taken.has(c)) return c; }
}

// ---- row builders. `slug` is passed only when creating ----
export function toTeamRow(v, slug) {
  const row = {
    name: t(v.name), tagline: t(v.tagline), mission: t(v.mission), lead_person_id: t(v.lead_person_id), image_path: t(v.image_path),
    is_public: !!v.is_public, is_featured: !!v.is_public && !!v.is_featured, sort_order: v.sort_order ?? 0,
  };
  if (slug) row.slug = slug;
  return row;
}

export function toPersonRow(v, slug) {
  const photo = t(v.photo_path);
  const row = {
    full_name: t(v.full_name), designation: t(v.designation), bio: t(v.bio), photo_path: photo, photo_consent: !!photo && !!v.photo_consent,
    orcid: t(v.orcid), linkedin_url: t(v.linkedin_url), public_email: t(v.public_email),
    is_public: !!v.is_public, sort_order: v.sort_order ?? 0,
  };
  if (slug) row.slug = slug;
  return row;
}

export const toMembershipRow = (v, teamId, personId) => ({
  team_id: teamId, person_id: personId, role: roleFromForm(v), start_date: v.start_date, end_date: t(v.end_date),
});

// A team lead who is not a current member of the team: the page shows a reminder.
export const leadMissing = (team, memberships) => !!team.lead_person_id
  && !memberships.some((m) => m.person_id === team.lead_person_id && !m.end_date);
