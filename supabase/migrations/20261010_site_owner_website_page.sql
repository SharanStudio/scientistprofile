-- Website page, owner gating, training/policy on the public site, publication metrics, news removed.
create or replace function public.is_site_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.site_settings s where s.owner_user_id = auth.uid());
$$;
revoke execute on function public.is_site_owner() from public, anon;
grant execute on function public.is_site_owner() to authenticated;

drop policy if exists site_settings_owner on public.site_settings;
create policy site_settings_owner on public.site_settings for all to authenticated
  using (owner_user_id = auth.uid()) with check (owner_user_id = auth.uid());

create or replace view site.training as
select e.id, e.data->>'title' as title, e.data->>'type' as type, e.data->>'level' as level,
  (e.data->>'participants')::int as participants, e.start_date, e.end_date
from public.entries e
where e.section = 'training' and e.is_public and e.user_id = site.owner_id();

create or replace view site.achievements as
select e.id, e.data->>'name' as title, e.data->>'category' as category,
  e.data->>'awarding_body' as awarding_body, extract(year from e.start_date)::int::text as year,
  e.data->>'description' as description, e.data->>'link' as link,
  e.data->>'certificate_path' as certificate_path, e.is_featured, e.data->>'level' as level
from public.entries e
where e.section = 'award' and e.is_public and e.user_id = site.owner_id()
union all
select e.id, e.data->>'title', 'Policy contribution', null, extract(year from e.start_date)::int::text,
  e.data->>'impact', null, null, e.is_featured, e.data->>'level'
from public.entries e
where e.section = 'policy' and e.is_public and e.user_id = site.owner_id();

create or replace view site.projects as
select e.id, e.data->>'name' as name, e.data->>'type' as type, e.data->>'status' as status,
  e.data->>'role' as role, e.data->>'collab' as collaborators, e.data->>'funder' as funder,
  e.data->'research_areas' as research_areas, e.data->'states' as states, t.slug as team_slug,
  e.start_date, e.end_date, e.ongoing, e.is_featured, e.data->>'site_summary' as summary
from public.entries e
left join public.teams t on t.id::text = e.data->>'team_id' and t.is_public
where e.section = 'project' and e.is_public and e.user_id = site.owner_id();

create or replace view site.publication_metrics as
select p.h_index, p.i10_index, p.orcid, p.scholar_link
from public.profiles p where p.user_id = site.owner_id();

grant select on site.training, site.achievements, site.projects, site.publication_metrics to anon;

-- Teaching leaves the website and the empty news table goes. Run last.
drop view if exists site.teaching;
drop view if exists site.news;
drop table if exists public.news;
