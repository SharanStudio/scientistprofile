-- Excel upload: People sheet needs an import marker so "Undo last import" can find the people it added.
alter table public.people add column if not exists import_id text;
create index if not exists people_import_id_idx on public.people (import_id) where import_id is not null;

-- Trainings no longer appear on the public website. Nothing else reads this view.
drop view if exists site.training;
