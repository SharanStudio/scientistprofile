import { h, today } from './dom.js';
import { buildForm } from './forms.js';
import { fmtDate } from './sections.js';
import { dataTable, iconLink, deleteButton, pill } from './ui.js';
import {
  teamFields, personFields, memberFields, slugify, uniqueSlug, toTeamRow, toPersonRow, toMembershipRow,
  roleToForm, leadMissing, NEW_PERSON,
} from './team-data.js';

// Team details: teams, people, and who sits in which team. Admin only (row-level security enforces it on the server).
// Routes: #/team (teams), #/team/people, #/team/t/<id|new> (team + members), #/team/p/<id|new> (person).

const TITLE = 'Team details';

const tabs = (active) => h('nav', { class: 'tabs', 'aria-label': 'Team details sections' },
  h('a', { href: '#/team', 'aria-current': active === 'teams' ? 'page' : false }, 'Teams'),
  h('a', { href: '#/team/people', 'aria-current': active === 'people' ? 'page' : false }, 'People'));

const publishNote = () => h('p', { class: 'hint' }, 'Changes show on the public website after its next rebuild. It runs nightly, or press "Update website now" on the ',
  h('a', { href: '#/website' }, 'Website page'), '.');

// Two taps to confirm, so a stray tap cannot delete anything.
function confirmButton(label, onConfirm) {
  const b = h('button', { class: 'link danger' }, label);
  let timer = null;
  b.addEventListener('click', async () => {
    if (!timer) {
      b.textContent = 'Tap again to confirm';
      timer = setTimeout(() => { timer = null; b.textContent = label; }, 4000);
      return;
    }
    clearTimeout(timer); timer = null;
    await onConfirm();
  });
  return b;
}

const when = (m) => (m.end_date ? `${fmtDate(m.start_date)}–${fmtDate(m.end_date)}` : m.start_date ? `since ${fmtDate(m.start_date)}` : 'current');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const visibility = (r) => [
  pill(r.is_public ? 'public' : 'private', r.is_public ? 'ok' : ''),
  r.is_featured ? pill('featured', 'ok') : null,
];

export async function viewTeam(ctx, parts = []) {
  const { shell, state } = ctx;
  if (!state.profile || state.profile.role !== 'admin') {
    return shell(TITLE, h('div', { class: 'flash warn' }, 'Team details are managed by the admin account.'));
  }
  const [a, b] = parts;
  if (a === 't' && b) return teamPage(ctx, b);
  if (a === 'p' && b) return personPage(ctx, b);
  if (a === 'people') return peopleList(ctx);
  return teamsList(ctx);
}

/* ---------- Teams tab ---------- */
async function teamsList(ctx) {
  const { sb, shell, loadingShell, friendly, setFlash } = ctx;
  loadingShell(TITLE);
  const [t, m, p] = await Promise.all([
    sb.from('teams').select('*').order('sort_order').order('name'),
    sb.from('team_memberships').select('team_id,end_date'),
    sb.from('entries').select('data,ongoing').eq('section', 'project'),
  ]);
  const err = t.error || m.error || p.error;
  if (err) return shell(TITLE, tabs('teams'), h('div', { class: 'flash error' }, friendly(err)));

  const stats = (id) => {
    const members = m.data.filter((x) => x.team_id === id);
    const projects = p.data.filter((x) => x.data && x.data.team_id === id);
    return { members: members.length, current: members.filter((x) => !x.end_date).length, projects: projects.length, ongoing: projects.filter((x) => x.ongoing).length };
  };

  const removeTeam = (team) => {
    const s = stats(team.id);
    return async () => {
      if (s.members || s.projects) {
        const has = [s.members ? plural(s.members, 'member record', 'member records') : '', s.projects ? plural(s.projects, 'project', 'projects') : ''].filter(Boolean).join(' and ');
        setFlash('error', `"${team.name}" still has ${has}. Remove the members and move the projects to another team first. To hide the team, untick "Show on public website" instead.`);
        return teamsList(ctx);
      }
      const { error } = await sb.from('teams').delete().eq('id', team.id);
      setFlash(error ? 'error' : 'ok', error ? friendly(error) : 'Team deleted.');
      return teamsList(ctx);
    };
  };

  shell({ title: TITLE, eyebrow: 'Projects & team', action: { href: '#/team/t/new', label: 'Add team' } }, tabs('teams'),
    t.data.length ? dataTable({ caption: 'Teams', rows: t.data,
      columns: [
        { label: 'Team', primary: true, get: (x) => x.name },
        { label: 'Members', get: (x) => plural(stats(x.id).current, 'current member', 'current members') },
        { label: 'Projects', get: (x) => plural(stats(x.id).ongoing, 'ongoing project', 'ongoing projects') },
        { label: 'Website', get: (x) => visibility(x) }],
      actions: (x) => [iconLink(`#/team/t/${x.id}`, `Edit ${x.name}`), deleteButton(`Delete ${x.name}`, removeTeam(x))] }) : h('p', { class: 'empty' }, 'No teams yet. Add your first team.'),
    publishNote());
}

/* ---------- People tab ---------- */
async function peopleList(ctx) {
  const { sb, shell, loadingShell, friendly, setFlash } = ctx;
  loadingShell(TITLE);
  const [pe, m, t] = await Promise.all([
    sb.from('people').select('*').order('sort_order').order('full_name'),
    sb.from('team_memberships').select('person_id,team_id,role,end_date'),
    sb.from('teams').select('id,name'),
  ]);
  const err = pe.error || m.error || t.error;
  if (err) return shell(TITLE, tabs('people'), h('div', { class: 'flash error' }, friendly(err)));
  const teamName = new Map(t.data.map((x) => [x.id, x.name]));

  const removePerson = (person) => {
    const mine = m.data.filter((x) => x.person_id === person.id);
    return async () => {
      if (mine.length) {
        setFlash('error', `${person.full_name} has ${plural(mine.length, 'membership record', 'membership records')}. End or remove them on the team page first. To hide the person, untick "Show on public website" instead.`);
        return peopleList(ctx);
      }
      const { error } = await sb.from('people').delete().eq('id', person.id);
      setFlash(error ? 'error' : 'ok', error ? friendly(error) : 'Person deleted.');
      return peopleList(ctx);
    };
  };
  const teamsOf = (person) => m.data.filter((x) => x.person_id === person.id && !x.end_date)
    .map((x) => `${x.role}, ${teamName.get(x.team_id) || 'a removed team'}`).join('; ') || 'not in any team';

  shell({ title: TITLE, eyebrow: 'Projects & team', action: { href: '#/team/p/new', label: 'Add person' } }, tabs('people'),
    pe.data.length ? dataTable({ caption: 'People', rows: pe.data,
      columns: [
        { label: 'Name', primary: true, get: (x) => x.full_name },
        { label: 'Designation', get: (x) => x.designation || '–' },
        { label: 'Team and role', get: (x) => teamsOf(x) },
        { label: 'Website', get: (x) => visibility(x) }],
      actions: (x) => [iconLink(`#/team/p/${x.id}`, `Edit ${x.full_name}`), deleteButton(`Delete ${x.full_name}`, removePerson(x))] }) : h('p', { class: 'empty' }, 'No people yet. Add the first person, or add one while adding a team member.'),
    publishNote());
}

/* ---------- one team, with its members ---------- */
async function teamPage(ctx, id) {
  const { sb, shell, loadingShell, friendly, setFlash, go } = ctx;
  const isNew = id === 'new';
  loadingShell(TITLE);
  const [pe, tm, ms] = await Promise.all([
    sb.from('people').select('id,full_name').order('full_name'),
    isNew ? { data: null, error: null } : sb.from('teams').select('*').eq('id', id).maybeSingle(),
    isNew ? { data: [], error: null } : sb.from('team_memberships').select('*').eq('team_id', id),
  ]);
  const err = pe.error || tm.error || ms.error;
  if (err) return shell(TITLE, tabs('teams'), h('div', { class: 'flash error' }, friendly(err)));
  if (!isNew && !tm.data) { setFlash('error', 'Team not found.'); return go('#/team'); }

  let team = tm.data;
  let people = pe.data;
  let memberships = ms.data;
  let editing = null;
  const peopleOpts = () => people.map((x) => ({ value: x.id, label: x.full_name }));

  // ---- team form ----
  const form = buildForm(teamFields(peopleOpts()), team || {});
  const msg = h('div', { class: 'err', role: 'alert' });
  const save = h('button', { class: 'primary' }, isNew ? 'Create team' : 'Save team');
  save.addEventListener('click', async () => {
    msg.textContent = '';
    if (!form.validate()) return;
    const v = form.values();
    save.disabled = true;
    try {
      if (isNew) {
        const { data: slugs, error: e1 } = await sb.from('teams').select('slug');
        if (e1) throw e1;
        const slug = uniqueSlug(slugify(v.name), new Set(slugs.map((x) => x.slug)));
        const { data, error } = await sb.from('teams').insert(toTeamRow(v, slug)).select('id').single();
        if (error) throw error;
        setFlash('ok', 'Team created. Add its members below.');
        return go(`#/team/t/${data.id}`);
      }
      const { error } = await sb.from('teams').update(toTeamRow(v)).eq('id', id);
      if (error) throw error;
      setFlash('ok', 'Team saved.');
      return teamPage(ctx, id);
    } catch (e) { msg.textContent = friendly(e); } finally { save.disabled = false; }
  });

  // ---- members panel (existing teams only) ----
  const box = h('div', {});
  async function refreshMembers() {
    const [m2, p2] = await Promise.all([
      sb.from('team_memberships').select('*').eq('team_id', id),
      sb.from('people').select('id,full_name').order('full_name'),
    ]);
    if (m2.error || p2.error) { setFlash('error', friendly(m2.error || p2.error)); return teamPage(ctx, id); }
    memberships = m2.data; people = p2.data; editing = null;
    renderMembers();
  }

  function renderMembers() {
    const name = new Map(people.map((x) => [x.id, x.full_name]));
    const sorted = [...memberships].sort((a, b) => (!a.end_date === !b.end_date
      ? (b.start_date || '').localeCompare(a.start_date || '') : (a.end_date ? 1 : -1)));

    const row = (m) => {
      const ends = m.end_date ? null : h('button', { class: 'link' }, 'End today');
      if (ends) ends.addEventListener('click', async () => {
        const { error } = await sb.from('team_memberships').update({ end_date: today() }).eq('id', m.id);
        setFlash(error ? 'error' : 'ok', error ? friendly(error) : 'Membership ended today.');
        await refreshMembers();
      });
      const edit = h('button', { class: 'link' }, 'Edit');
      edit.addEventListener('click', () => { editing = m; renderMembers(); });
      const rm = confirmButton('Remove', async () => {
        const { error } = await sb.from('team_memberships').delete().eq('id', m.id);
        setFlash(error ? 'error' : 'ok', error ? friendly(error) : 'Membership record removed.');
        await refreshMembers();
      });
      return h('li', { class: 'row' },
        h('div', { class: 'row-main' }, h('strong', {}, name.get(m.person_id) || 'A removed person'), h('span', { class: `tag${m.end_date ? '' : ' ok'}` }, m.role),
          h('div', { class: 'hint' }, when(m))),
        h('div', { class: 'row-actions' }, edit, ends, rm));
    };

    // ---- add / edit membership ----
    const initial = editing ? { ...roleToForm(editing.role), start_date: editing.start_date, end_date: editing.end_date } : {};
    const mf = buildForm(memberFields(peopleOpts(), !!editing), initial);
    const mmsg = h('div', { class: 'err', role: 'alert' });
    const go2 = h('button', { class: 'primary' }, editing ? 'Save membership' : 'Add member');
    go2.addEventListener('click', async () => {
      mmsg.textContent = '';
      if (!mf.validate()) return;
      const v = mf.values();
      go2.disabled = true;
      try {
        let personId = editing ? editing.person_id : v.person_id;
        if (!editing && personId !== NEW_PERSON && memberships.some((m) => m.person_id === personId && !m.end_date)) {
          throw new Error('This person is already a current member. Edit that membership, or end it first.');
        }
        if (!editing && personId === NEW_PERSON) {
          const { data: slugs, error: e1 } = await sb.from('people').select('slug');
          if (e1) throw e1;
          const slug = uniqueSlug(slugify(v.new_name), new Set(slugs.map((x) => x.slug)));
          const made = await sb.from('people').insert({ full_name: v.new_name, designation: v.new_designation, slug, is_public: false, photo_consent: false, sort_order: 0 }).select('id').single();
          if (made.error) throw made.error;
          personId = made.data.id;
        }
        const row = toMembershipRow(v, id, personId);
        const { error } = editing
          ? await sb.from('team_memberships').update({ role: row.role, start_date: row.start_date, end_date: row.end_date }).eq('id', editing.id)
          : await sb.from('team_memberships').insert(row);
        if (error) throw error;
        setFlash('ok', editing ? 'Membership saved.' : 'Member added.');
        await refreshMembers();
      } catch (e) { mmsg.textContent = friendly(e); } finally { go2.disabled = false; }
    });
    const cancel = editing ? h('button', { class: 'secondary' }, 'Cancel') : null;
    if (cancel) cancel.addEventListener('click', () => { editing = null; renderMembers(); });

    box.replaceChildren(
      h('h2', {}, 'Members'),
      leadMissing(team, memberships) ? h('div', { class: 'flash warn' }, 'The team lead is not a current member of this team. Add them below with the role Team Lead.') : null,
      sorted.length ? h('ul', { class: 'rows' }, sorted.map(row)) : h('p', { class: 'empty' }, 'No members yet.'),
      h('h2', {}, editing ? `Edit membership: ${name.get(editing.person_id) || ''}` : 'Add a member'),
      mf.el, mmsg, h('div', { class: 'actions' }, go2, cancel));
  }
  if (!isNew) renderMembers();

  shell(isNew ? 'New team' : team.name, tabs('teams'),
    form.el, msg,
    h('div', { class: 'actions' }, save, h('a', { class: 'btn', href: '#/team' }, isNew ? 'Cancel' : 'Back to teams')),
    isNew ? h('p', { class: 'hint' }, 'You can add members after the team is created.') : box,
    publishNote());
}

/* ---------- one person ---------- */
async function personPage(ctx, id) {
  const { sb, shell, loadingShell, friendly, setFlash, go } = ctx;
  const isNew = id === 'new';
  loadingShell(TITLE);
  const [pr, ms, tm] = await Promise.all([
    isNew ? { data: null, error: null } : sb.from('people').select('*').eq('id', id).maybeSingle(),
    isNew ? { data: [], error: null } : sb.from('team_memberships').select('*').eq('person_id', id),
    sb.from('teams').select('id,name'),
  ]);
  const err = pr.error || ms.error || tm.error;
  if (err) return shell(TITLE, tabs('people'), h('div', { class: 'flash error' }, friendly(err)));
  if (!isNew && !pr.data) { setFlash('error', 'Person not found.'); return go('#/team/people'); }
  const teamName = new Map(tm.data.map((x) => [x.id, x.name]));

  const form = buildForm(personFields(), pr.data || {});
  const msg = h('div', { class: 'err', role: 'alert' });
  const save = h('button', { class: 'primary' }, isNew ? 'Add person' : 'Save person');
  save.addEventListener('click', async () => {
    msg.textContent = '';
    if (!form.validate()) return;
    const v = form.values();
    save.disabled = true;
    try {
      if (isNew) {
        const { data: slugs, error: e1 } = await sb.from('people').select('slug');
        if (e1) throw e1;
        const slug = uniqueSlug(slugify(v.full_name), new Set(slugs.map((x) => x.slug)));
        const { error } = await sb.from('people').insert(toPersonRow(v, slug));
        if (error) throw error;
        setFlash('ok', 'Person added. Put them in a team from the team page.');
        return go('#/team/people');
      }
      const { error } = await sb.from('people').update(toPersonRow(v)).eq('id', id);
      if (error) throw error;
      setFlash('ok', 'Person saved.');
      return personPage(ctx, id);
    } catch (e) { msg.textContent = friendly(e); } finally { save.disabled = false; }
  });

  const teams = isNew ? null : h('div', {},
    h('h2', {}, 'Teams'),
    ms.data.length
      ? h('ul', { class: 'rows' }, ms.data.map((m) => h('li', { class: 'row' },
        h('div', { class: 'row-main' }, h('strong', {}, teamName.get(m.team_id) || 'A removed team'), h('span', { class: `tag${m.end_date ? '' : ' ok'}` }, m.role),
          h('div', { class: 'hint' }, when(m))),
        h('div', { class: 'row-actions' }, h('a', { href: `#/team/t/${m.team_id}` }, 'Open team')))))
      : h('p', { class: 'empty' }, 'Not in any team yet. Add them from a team page.'));

  shell(isNew ? 'New person' : pr.data.full_name, tabs('people'),
    form.el, msg,
    h('div', { class: 'actions' }, save, h('a', { class: 'btn', href: '#/team/people' }, isNew ? 'Cancel' : 'Back to people')),
    teams, publishNote());
}
