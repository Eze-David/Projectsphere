-- BuildHub: projects shared between team members.
-- Access rule: you can see and edit a project (and everything in it) only if you are in project_members.

-- ---------- Tables ----------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client text not null default '',
  location text not null default '',
  type text not null default '',
  status text not null default 'Pre-construction',
  start_date date,
  end_date date,
  budget numeric not null default 0,
  hue int not null default 210,
  description text not null default '',
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid not null references public.projects on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

-- Invitations for people who don't have an account yet; converted to memberships when they sign up.
create table public.project_invites (
  project_id uuid not null references public.projects on delete cascade,
  email text not null,
  invited_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, email)
);

create table public.task_lists (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  list_id uuid not null references public.task_lists on delete cascade,
  number int not null default 0,
  title text not null,
  description text not null default '',
  status text not null default 'To do',
  assignees text[] not null default '{}',
  start_date date,
  due_date date,
  progress int not null default 0 check (progress between 0 and 100),
  priority text not null default 'Medium',
  labels text[] not null default '{}',
  hours numeric not null default 0,
  created_at timestamptz not null default now()
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  task_id uuid not null references public.tasks on delete cascade,
  author text not null default '',
  author_id uuid default auth.uid() references auth.users on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name text not null,
  date date not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.costs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  code text not null default '',
  description text not null default '',
  budgeted numeric not null default 0,
  actual numeric not null default 0,
  created_at timestamptz not null default now()
);

create table public.rfis (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  number int not null default 0,
  subject text not null,
  assignee text not null default '',
  due_date date,
  status text not null default 'Open',
  question text not null default '',
  answer text not null default '',
  created_at timestamptz not null default now()
);

create table public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  date date not null,
  weather text not null default '',
  crew int not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- Project directory: people on the job, who may or may not have an account (e.g. subcontractors).
create table public.team_contacts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  name text not null,
  role text not null default '',
  company text not null default '',
  email text not null default '',
  created_at timestamptz not null default now()
);

create index on public.project_members (user_id);
create index on public.task_lists (project_id);
create index on public.tasks (project_id);
create index on public.tasks (list_id);
create index on public.task_comments (task_id);
create index on public.milestones (project_id);
create index on public.costs (project_id);
create index on public.rfis (project_id);
create index on public.daily_logs (project_id);
create index on public.team_contacts (project_id);

-- ---------- Access helpers ----------

create function public.is_member(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = pid and user_id = auth.uid());
$$;

create function public.is_owner(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from project_members where project_id = pid and user_id = auth.uid() and role = 'owner');
$$;

create function public.shares_project(other uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members a join project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

-- ---------- Triggers ----------

-- New account → profile, and accept any pending invitations for that email.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), lower(new.email));

  insert into project_members (project_id, user_id)
  select project_id, new.id from project_invites where email = lower(new.email)
  on conflict do nothing;
  delete from project_invites where email = lower(new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Whoever creates a project owns it.
create function public.handle_new_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into project_members (project_id, user_id, role) values (new.id, new.created_by, 'owner');
  return new;
end;
$$;

create trigger on_project_created
  after insert on public.projects
  for each row execute function public.handle_new_project();

-- ---------- Invitations ----------

-- Owners add people by email: existing accounts get access now, others when they sign up.
create function public.invite_member(pid uuid, invite_email text) returns text
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(invite_email));
  uid uuid;
begin
  if not is_owner(pid) then
    raise exception 'Only project owners can invite people';
  end if;
  if e !~ '^\S+@\S+\.\S+$' then
    raise exception 'Enter a valid email';
  end if;

  select id into uid from profiles where email = e;
  if uid is not null then
    insert into project_members (project_id, user_id) values (pid, uid) on conflict do nothing;
    return 'added';
  end if;

  insert into project_invites (project_id, email) values (pid, e) on conflict do nothing;
  return 'invited';
end;
$$;

-- ---------- Row level security ----------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.task_lists enable row level security;
alter table public.tasks enable row level security;
alter table public.task_comments enable row level security;
alter table public.milestones enable row level security;
alter table public.costs enable row level security;
alter table public.rfis enable row level security;
alter table public.daily_logs enable row level security;
alter table public.team_contacts enable row level security;

create policy "see self and teammates" on public.profiles
  for select using (id = auth.uid() or shares_project(id));
create policy "edit own profile" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "members read" on public.projects for select using (is_member(id));
create policy "anyone signed in creates" on public.projects for insert with check (created_by = auth.uid());
create policy "members update" on public.projects for update using (is_member(id)) with check (is_member(id));
create policy "owners delete" on public.projects for delete using (is_owner(id));

create policy "members read" on public.project_members for select using (is_member(project_id));
create policy "owners remove, members leave" on public.project_members
  for delete using (is_owner(project_id) or user_id = auth.uid());

create policy "members read" on public.project_invites for select using (is_member(project_id));
create policy "owners cancel" on public.project_invites for delete using (is_owner(project_id));

create policy "members" on public.task_lists for all using (is_member(project_id)) with check (is_member(project_id));
create policy "members" on public.tasks for all using (is_member(project_id)) with check (is_member(project_id));
create policy "members" on public.task_comments for all using (is_member(project_id)) with check (is_member(project_id));
create policy "members" on public.milestones for all using (is_member(project_id)) with check (is_member(project_id));
create policy "members" on public.costs for all using (is_member(project_id)) with check (is_member(project_id));
create policy "members" on public.rfis for all using (is_member(project_id)) with check (is_member(project_id));
create policy "members" on public.daily_logs for all using (is_member(project_id)) with check (is_member(project_id));
create policy "members" on public.team_contacts for all using (is_member(project_id)) with check (is_member(project_id));

grant select, insert, update, delete on all tables in schema public to authenticated;
revoke execute on function public.invite_member(uuid, text) from anon, public;
grant execute on function public.invite_member(uuid, text) to authenticated;

-- ---------- Realtime: teammates see each other's changes live ----------

alter publication supabase_realtime add table
  public.projects, public.project_members, public.project_invites, public.task_lists, public.tasks,
  public.task_comments, public.milestones, public.costs, public.rfis, public.daily_logs, public.team_contacts;
