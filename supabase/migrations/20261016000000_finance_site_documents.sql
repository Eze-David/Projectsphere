-- Expenses, client invoices (finance), materials, equipment, and documents (with file storage).
-- Same access rule as everything else: project members only.

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  date date not null default current_date,
  description text not null,
  category text not null default 'Other',
  vendor text not null default '',
  cost_id uuid references public.costs on delete set null,
  amount numeric not null default 0,
  payment_method text not null default '',
  status text not null default 'Pending',
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  number int not null default 0,
  date date not null default current_date,
  due_date date,
  description text not null default '',
  amount numeric not null default 0,
  status text not null default 'Draft',
  paid_date date,
  created_at timestamptz not null default now()
);

create table public.materials (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name text not null,
  unit text not null default '',
  quantity numeric not null default 0,
  delivered numeric not null default 0,
  used numeric not null default 0,
  unit_cost numeric not null default 0,
  supplier text not null default '',
  needed_by date,
  status text not null default 'Requested',
  created_at timestamptz not null default now()
);

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name text not null,
  category text not null default '',
  ownership text not null default 'Rented',
  supplier text not null default '',
  daily_rate numeric not null default 0,
  start_date date,
  end_date date,
  status text not null default 'Scheduled',
  operator text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name text not null,
  folder text not null default 'Other',
  path text not null unique,
  size bigint not null default 0,
  mime text not null default '',
  uploaded_by uuid default auth.uid() references auth.users on delete set null,
  uploader text not null default '',
  created_at timestamptz not null default now()
);

create index on public.expenses (project_id);
create index on public.invoices (project_id);
create index on public.materials (project_id);
create index on public.equipment (project_id);
create index on public.documents (project_id);

alter table public.expenses enable row level security;
alter table public.invoices enable row level security;
alter table public.materials enable row level security;
alter table public.equipment enable row level security;
alter table public.documents enable row level security;

create policy "members" on public.expenses for all using (is_member(project_id)) with check (is_member(project_id));
create policy "members" on public.invoices for all using (is_member(project_id)) with check (is_member(project_id));
create policy "members" on public.materials for all using (is_member(project_id)) with check (is_member(project_id));
create policy "members" on public.equipment for all using (is_member(project_id)) with check (is_member(project_id));
create policy "members" on public.documents for all using (is_member(project_id)) with check (is_member(project_id));

grant select, insert, update, delete on public.expenses, public.invoices, public.materials, public.equipment, public.documents to authenticated;

alter publication supabase_realtime add table public.expenses, public.invoices, public.materials, public.equipment, public.documents;

-- ---------- File storage: private bucket, files stored as <project_id>/<file> ----------

insert into storage.buckets (id, name, public, file_size_limit)
values ('documents', 'documents', false, 52428800) -- 50 MB per file
on conflict (id) do nothing;

create function public.can_access_document(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when split_part(object_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then is_member(split_part(object_name, '/', 1)::uuid)
    else false
  end;
$$;

create policy "project members read files" on storage.objects
  for select to authenticated using (bucket_id = 'documents' and public.can_access_document(name));
create policy "project members upload files" on storage.objects
  for insert to authenticated with check (bucket_id = 'documents' and public.can_access_document(name));
create policy "project members delete files" on storage.objects
  for delete to authenticated using (bucket_id = 'documents' and public.can_access_document(name));
