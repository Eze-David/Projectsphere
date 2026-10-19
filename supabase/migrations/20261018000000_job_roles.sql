-- Job roles: each project member has a role that decides what they can see and do.
--   owner, project_manager, quantity_surveyor, site_engineer, subcontractor, client
-- Access is per "area" and level: 0 hidden · 1 view · 2 limited (add/submit/request, or own items only)
--                                 3 edit · 4 approve/manage
-- Every table's row-level security is rebuilt on top of access(project, area).

-- ---------- Roles ----------

alter table public.project_members drop constraint project_members_role_check;
update public.project_members set role = 'project_manager' where role = 'approver';
update public.project_members set role = 'site_engineer' where role = 'member';
alter table public.project_members alter column role set default 'site_engineer';
alter table public.project_members add constraint project_members_role_check
  check (role in ('owner', 'project_manager', 'quantity_surveyor', 'site_engineer', 'subcontractor', 'client'));

alter table public.project_invites add column role text not null default 'site_engineer'
  check (role in ('owner', 'project_manager', 'quantity_surveyor', 'site_engineer', 'subcontractor', 'client'));

-- The access table. Keep in sync with ACCESS in src/store.jsx (the app uses it to show/hide things).
create function public.role_level(r text, area text) returns int
language sql immutable as $$
  select coalesce((
    select lvl from (values
      -- area          owner pm  qs  se  sub client
      ('tasks',        4,    3,  1,  3,  2,  1),
      ('logs',         4,    3,  1,  3,  2,  1),
      ('site',         4,    3,  3,  3,  0,  0),
      ('rfis',         4,    3,  1,  3,  3,  1),
      ('documents',    4,    3,  3,  3,  1,  1),
      ('expenses',     4,    4,  4,  2,  0,  0),
      ('budget',       4,    3,  3,  2,  0,  0),
      ('finance',      4,    3,  3,  0,  0,  0),
      ('team',         4,    3,  1,  1,  0,  0),
      ('settings',     4,    3,  0,  0,  0,  0)
    ) as t(a, owner, pm, qs, se, sub, client),
    lateral (select case r
      when 'owner' then owner when 'project_manager' then pm when 'quantity_surveyor' then qs
      when 'site_engineer' then se when 'subcontractor' then sub when 'client' then client end) as l(lvl)
    where t.a = area
  ), 0);
$$;

create function public.my_role(pid uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from project_members where project_id = pid and user_id = auth.uid();
$$;

create function public.access(pid uuid, area text) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(role_level(my_role(pid), area), 0);
$$;

-- Expense approvers (and budget editors): owner, project manager, quantity surveyor.
create or replace function public.can_approve(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select access(pid, 'expenses') >= 4;
$$;

create or replace function public.can_approve_for(pid uuid, submitter uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_approve(pid) and (
    submitter is distinct from auth.uid()
    or not exists (
      select 1 from project_members m
      where m.project_id = pid and m.user_id <> auth.uid() and role_level(m.role, 'expenses') >= 4
    )
  );
$$;

-- ---------- Invitations carry a role ----------

drop function public.invite_member(uuid, text);
create function public.invite_member(pid uuid, invite_email text, invite_role text default 'site_engineer') returns text
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(invite_email));
  uid uuid;
begin
  if access(pid, 'team') < 3 then
    raise exception 'You can’t invite people to this project';
  end if;
  if invite_role not in ('owner', 'project_manager', 'quantity_surveyor', 'site_engineer', 'subcontractor', 'client') then
    raise exception 'Unknown role';
  end if;
  if invite_role = 'owner' and not is_owner(pid) then
    raise exception 'Only owners can invite another owner';
  end if;
  if e !~ '^\S+@\S+\.\S+$' then
    raise exception 'Enter a valid email';
  end if;

  select id into uid from profiles where email = e;
  if uid is not null then
    insert into project_members (project_id, user_id, role) values (pid, uid, invite_role) on conflict do nothing;
    return 'added';
  end if;

  insert into project_invites (project_id, email, role) values (pid, e, invite_role)
  on conflict (project_id, email) do update set role = excluded.role;
  return 'invited';
end;
$$;

revoke execute on function public.invite_member(uuid, text, text) from anon, public;
grant execute on function public.invite_member(uuid, text, text) to authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), lower(new.email));

  insert into project_members (project_id, user_id, role)
  select project_id, new.id, role from project_invites where email = lower(new.email)
  on conflict do nothing;
  delete from project_invites where email = lower(new.email);
  return new;
end;
$$;

create or replace function public.set_member_role(pid uuid, member uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(pid) then
    raise exception 'Only project owners can change roles';
  end if;
  if member = auth.uid() then
    raise exception 'You can’t change your own role';
  end if;
  if new_role not in ('owner', 'project_manager', 'quantity_surveyor', 'site_engineer', 'subcontractor', 'client') then
    raise exception 'Unknown role';
  end if;
  update project_members set role = new_role where project_id = pid and user_id = member;
end;
$$;

-- ---------- Contract value moves to its own table (so only roles with budget access can read it) ----------

create table public.contract_values (
  project_id uuid primary key references public.projects on delete cascade,
  amount numeric not null default 0
);
insert into public.contract_values (project_id, amount) select id, budget from public.projects;
update public.projects set budget = 0;
drop trigger contract_value_guard on public.projects;
drop function public.enforce_contract_value();

-- Daily logs remember who wrote them (subcontractors see only their own).
alter table public.daily_logs add column created_by uuid default auth.uid() references auth.users on delete set null;

-- ---------- Rebuild row-level security ----------

do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in (
      'projects', 'project_members', 'project_invites', 'task_lists', 'tasks', 'task_comments', 'milestones',
      'costs', 'rfis', 'daily_logs', 'team_contacts', 'expenses', 'invoices', 'materials', 'equipment',
      'documents', 'attachments', 'budget_requests')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

alter table public.contract_values enable row level security;

-- Projects: every member sees the project; managers edit settings; owners delete.
create policy "members read" on public.projects for select using (is_member(id));
create policy "signed-in users create" on public.projects for insert with check (created_by = auth.uid());
create policy "settings editors update" on public.projects for update using (access(id, 'settings') >= 3) with check (access(id, 'settings') >= 3);
create policy "owners delete" on public.projects for delete using (access(id, 'settings') >= 4);

create policy "budget readers" on public.contract_values for select using (access(project_id, 'budget') >= 1);
create policy "settings editors add" on public.contract_values for insert with check (access(project_id, 'settings') >= 3);
create policy "settings editors update" on public.contract_values for update using (access(project_id, 'settings') >= 3) with check (access(project_id, 'settings') >= 3);

-- Team
create policy "self, or team readers" on public.project_members for select using (user_id = auth.uid() or access(project_id, 'team') >= 1);
create policy "owners remove, members leave" on public.project_members for delete using (is_owner(project_id) or user_id = auth.uid());
create policy "team readers" on public.project_invites for select using (access(project_id, 'team') >= 1);
create policy "inviters cancel" on public.project_invites for delete using (access(project_id, 'team') >= 3);
create policy "team readers" on public.team_contacts for select using (access(project_id, 'team') >= 1);
create policy "team editors add" on public.team_contacts for insert with check (access(project_id, 'team') >= 3);
create policy "team editors update" on public.team_contacts for update using (access(project_id, 'team') >= 3) with check (access(project_id, 'team') >= 3);
create policy "team editors delete" on public.team_contacts for delete using (access(project_id, 'team') >= 3);

-- Tasks: level 2 (subcontractor) sees and edits only tasks assigned to them, by name.
create policy "readers" on public.task_lists for select using (access(project_id, 'tasks') >= 1);
create policy "editors add" on public.task_lists for insert with check (access(project_id, 'tasks') >= 3);
create policy "editors update" on public.task_lists for update using (access(project_id, 'tasks') >= 3) with check (access(project_id, 'tasks') >= 3);
create policy "editors delete" on public.task_lists for delete using (access(project_id, 'tasks') >= 3);

create policy "readers (subcontractors: assigned only)" on public.tasks for select using (
  access(project_id, 'tasks') >= 1 and (access(project_id, 'tasks') <> 2 or my_display_name() = any (assignees)));
create policy "editors add" on public.tasks for insert with check (access(project_id, 'tasks') >= 3);
create policy "editors, or assigned subcontractor, update" on public.tasks for update
  using (access(project_id, 'tasks') >= 3 or (access(project_id, 'tasks') = 2 and my_display_name() = any (assignees)))
  with check (access(project_id, 'tasks') >= 3 or (access(project_id, 'tasks') = 2 and my_display_name() = any (assignees)));
create policy "editors delete" on public.tasks for delete using (access(project_id, 'tasks') >= 3);

create policy "readers of the task" on public.task_comments for select using (exists (select 1 from public.tasks t where t.id = task_id));
create policy "contributors comment" on public.task_comments for insert with check (
  access(project_id, 'tasks') >= 2 and exists (select 1 from public.tasks t where t.id = task_id));
create policy "author or editor deletes" on public.task_comments for delete using (author_id = auth.uid() or access(project_id, 'tasks') >= 3);

create policy "readers" on public.milestones for select using (access(project_id, 'tasks') >= 1);
create policy "editors add" on public.milestones for insert with check (access(project_id, 'tasks') >= 3);
create policy "editors update" on public.milestones for update using (access(project_id, 'tasks') >= 3) with check (access(project_id, 'tasks') >= 3);
create policy "editors delete" on public.milestones for delete using (access(project_id, 'tasks') >= 3);

-- Daily logs: level 2 adds logs and sees only their own.
create policy "readers (limited: own only)" on public.daily_logs for select using (
  access(project_id, 'logs') >= 1 and (access(project_id, 'logs') <> 2 or created_by = auth.uid()));
create policy "contributors add" on public.daily_logs for insert with check (access(project_id, 'logs') >= 2);
create policy "editors or author update" on public.daily_logs for update
  using (access(project_id, 'logs') >= 3 or (access(project_id, 'logs') = 2 and created_by = auth.uid()))
  with check (access(project_id, 'logs') >= 2);
create policy "editors or author delete" on public.daily_logs for delete
  using (access(project_id, 'logs') >= 3 or (access(project_id, 'logs') = 2 and created_by = auth.uid()));

-- Site: materials & equipment
create policy "readers" on public.materials for select using (access(project_id, 'site') >= 1);
create policy "editors add" on public.materials for insert with check (access(project_id, 'site') >= 3);
create policy "editors update" on public.materials for update using (access(project_id, 'site') >= 3) with check (access(project_id, 'site') >= 3);
create policy "editors delete" on public.materials for delete using (access(project_id, 'site') >= 3);
create policy "readers" on public.equipment for select using (access(project_id, 'site') >= 1);
create policy "editors add" on public.equipment for insert with check (access(project_id, 'site') >= 3);
create policy "editors update" on public.equipment for update using (access(project_id, 'site') >= 3) with check (access(project_id, 'site') >= 3);
create policy "editors delete" on public.equipment for delete using (access(project_id, 'site') >= 3);

-- Requests for Information
create policy "readers" on public.rfis for select using (access(project_id, 'rfis') >= 1);
create policy "editors add" on public.rfis for insert with check (access(project_id, 'rfis') >= 3);
create policy "editors update" on public.rfis for update using (access(project_id, 'rfis') >= 3) with check (access(project_id, 'rfis') >= 3);
create policy "editors delete" on public.rfis for delete using (access(project_id, 'rfis') >= 3);

-- Documents
create policy "readers" on public.documents for select using (access(project_id, 'documents') >= 1);
create policy "editors add" on public.documents for insert with check (access(project_id, 'documents') >= 3);
create policy "editors update" on public.documents for update using (access(project_id, 'documents') >= 3) with check (access(project_id, 'documents') >= 3);
create policy "editors delete" on public.documents for delete using (access(project_id, 'documents') >= 3);

-- Expenses: approvers see all; level 2 (site engineer) submits and sees only their own.
create policy "approvers, or own" on public.expenses for select using (
  access(project_id, 'expenses') >= 4 or (access(project_id, 'expenses') >= 2 and created_by = auth.uid()));
create policy "submitters add" on public.expenses for insert with check (access(project_id, 'expenses') >= 2);
create policy "approvers or submitter edit" on public.expenses for update
  using (access(project_id, 'expenses') >= 4 or (access(project_id, 'expenses') >= 2 and created_by = auth.uid()))
  with check (access(project_id, 'expenses') >= 2);
create policy "approver, or submitter while pending, deletes" on public.expenses for delete using (
  access(project_id, 'expenses') >= 4 or (access(project_id, 'expenses') >= 2 and created_by = auth.uid() and status = 'Pending'));

-- Budget
create policy "readers" on public.costs for select using (access(project_id, 'budget') >= 1);
create policy "editors add" on public.costs for insert with check (access(project_id, 'budget') >= 3);
create policy "editors update" on public.costs for update using (access(project_id, 'budget') >= 3) with check (access(project_id, 'budget') >= 3);
create policy "editors delete" on public.costs for delete using (access(project_id, 'budget') >= 3);
create policy "readers" on public.budget_requests for select using (access(project_id, 'budget') >= 1);
create policy "requesters add" on public.budget_requests for insert with check (access(project_id, 'budget') >= 2);
create policy "requester withdraws, editor deletes" on public.budget_requests for delete using (
  access(project_id, 'budget') >= 3 or (requested_by = auth.uid() and status = 'Pending'));

-- Finance (client invoices)
create policy "readers" on public.invoices for select using (access(project_id, 'finance') >= 1);
create policy "editors add" on public.invoices for insert with check (access(project_id, 'finance') >= 3);
create policy "editors update" on public.invoices for update using (access(project_id, 'finance') >= 3) with check (access(project_id, 'finance') >= 3);
create policy "editors delete" on public.invoices for delete using (access(project_id, 'finance') >= 3);

-- Attachments follow the record they're attached to.
create function public.attachment_area(t text) returns text
language sql immutable as $$
  select case t
    when 'expense' then 'expenses' when 'invoice' then 'finance' when 'material' then 'site'
    when 'equipment' then 'site' when 'log' then 'logs' when 'rfi' then 'rfis' when 'task' then 'tasks' end;
$$;

-- Can the current user see the record? (Runs with the caller's own row-level security.)
create function public.can_see_record(t text, rid uuid) returns boolean
language sql stable set search_path = public as $$
  select case t
    when 'expense' then exists (select 1 from expenses where id = rid)
    when 'invoice' then exists (select 1 from invoices where id = rid)
    when 'material' then exists (select 1 from materials where id = rid)
    when 'equipment' then exists (select 1 from equipment where id = rid)
    when 'log' then exists (select 1 from daily_logs where id = rid)
    when 'rfi' then exists (select 1 from rfis where id = rid)
    when 'task' then exists (select 1 from tasks where id = rid)
    else false end;
$$;

create policy "whoever can see the record" on public.attachments for select using (can_see_record(entity_type, entity_id));
create policy "contributors attach" on public.attachments for insert with check (
  access(project_id, attachment_area(entity_type)) >= 2 and can_see_record(entity_type, entity_id));
create policy "editors or uploader remove" on public.attachments for delete using (
  uploaded_by = auth.uid() or access(project_id, attachment_area(entity_type)) >= 3);

-- ---------- File storage follows the same rules ----------

drop policy "project members read files" on storage.objects;
drop policy "project members upload files" on storage.objects;
drop policy "project members delete files" on storage.objects;

-- Uploading: documents need Documents edit access; attachments need at least "limited" access somewhere.
create function public.can_upload_file(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when split_part(object_name, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    when split_part(object_name, '/', 2) = 'attachments' then
      greatest(access(split_part(object_name, '/', 1)::uuid, 'tasks'), access(split_part(object_name, '/', 1)::uuid, 'logs'),
               access(split_part(object_name, '/', 1)::uuid, 'expenses'), access(split_part(object_name, '/', 1)::uuid, 'rfis'),
               access(split_part(object_name, '/', 1)::uuid, 'site'), access(split_part(object_name, '/', 1)::uuid, 'finance')) >= 2
    else access(split_part(object_name, '/', 1)::uuid, 'documents') >= 3
  end;
$$;

-- Reading: only files whose document/attachment row you can see.
create policy "read visible files" on storage.objects for select to authenticated using (
  bucket_id = 'documents' and (
    exists (select 1 from public.documents d where d.path = storage.objects.name)
    or exists (select 1 from public.attachments a where a.path = storage.objects.name)));
create policy "upload allowed files" on storage.objects for insert to authenticated with check (
  bucket_id = 'documents' and public.can_upload_file(name));
-- Deleting: files you could remove the row for, or leftovers with no row that you were allowed to upload.
create policy "delete allowed files" on storage.objects for delete to authenticated using (
  bucket_id = 'documents' and (
    exists (select 1 from public.documents d where d.path = storage.objects.name and public.access(d.project_id, 'documents') >= 3)
    or exists (select 1 from public.attachments a where a.path = storage.objects.name
               and (a.uploaded_by = auth.uid() or public.access(a.project_id, public.attachment_area(a.entity_type)) >= 3))
    or (public.can_upload_file(name)
        and not exists (select 1 from public.documents d where d.path = storage.objects.name)
        and not exists (select 1 from public.attachments a where a.path = storage.objects.name))));

grant select, insert, update on public.contract_values to authenticated;
alter publication supabase_realtime add table public.contract_values;
