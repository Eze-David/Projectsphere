-- Photos and files attached to individual records (expense receipts, delivery notes, site photos…).
-- Files live in the existing private 'documents' bucket under <project_id>/attachments/, so the
-- storage policies from the previous migration already restrict them to project members.

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  entity_type text not null check (entity_type in ('expense', 'material', 'equipment', 'log', 'rfi', 'task')),
  entity_id uuid not null,
  name text not null,
  path text not null unique,
  size bigint not null default 0,
  mime text not null default '',
  uploaded_by uuid default auth.uid() references auth.users on delete set null,
  uploader text not null default '',
  created_at timestamptz not null default now()
);

create index on public.attachments (project_id);
create index on public.attachments (entity_id);

alter table public.attachments enable row level security;
create policy "members" on public.attachments for all using (is_member(project_id)) with check (is_member(project_id));
grant select, insert, update, delete on public.attachments to authenticated;

alter publication supabase_realtime add table public.attachments;
