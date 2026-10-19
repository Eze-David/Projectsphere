-- Task edit rights:
--   * Task details (name, list, assignees, dates, priority, labels, description) can be changed only by
--     owners, project managers ("edit all tasks") and whoever created the task.
--   * People assigned to a task can still move its stage (which sets progress), log hours, comment and attach.

alter table public.tasks add column created_by uuid default auth.uid() references auth.users on delete set null;

-- Project managers now "edit all tasks" (level 4), like owners. Other task creators (level 3) edit their own.
-- Keep in sync with ACCESS in src/store.jsx.
create or replace function public.role_level(r text, area text) returns int
language sql immutable as $$
  select coalesce((
    select case r
      when 'owner' then owner when 'project_manager' then pm when 'quantity_surveyor' then qs
      when 'architect' then arch when 'structural_engineer' then struct when 'mechanical_engineer' then mech
      when 'electrical_engineer' then elec when 'site_engineer' then se when 'subcontractor' then sub
      when 'mason' then mason when 'client' then client end
    from (values
      -- area        owner pm qs arch struct mech elec se sub mason client
      ('tasks',      4,    4, 1, 3,   3,     3,   3,   3, 2,  2,    1),
      ('logs',       4,    3, 1, 1,   1,     1,   1,   3, 2,  2,    1),
      ('site',       4,    3, 3, 1,   1,     1,   1,   3, 0,  1,    0),
      ('rfis',       4,    3, 1, 3,   3,     3,   3,   3, 3,  1,    1),
      ('documents',  4,    3, 3, 3,   3,     3,   3,   3, 1,  1,    1),
      ('expenses',   4,    4, 4, 0,   0,     0,   0,   2, 0,  0,    0),
      ('budget',     4,    3, 3, 0,   0,     0,   0,   2, 0,  0,    0),
      ('finance',    4,    3, 3, 0,   0,     0,   0,   0, 0,  0,    0),
      ('team',       4,    3, 1, 1,   1,     1,   1,   1, 0,  0,    0),
      ('settings',   4,    3, 0, 0,   0,     0,   0,   0, 0,  0,    0)
    ) as t(a, owner, pm, qs, arch, struct, mech, elec, se, sub, mason, client)
    where t.a = area
  ), 0);
$$;

-- Can the current user change this task's details?
create function public.can_edit_task_details(pid uuid, creator uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select access(pid, 'tasks') >= 4 or (access(pid, 'tasks') >= 3 and creator = auth.uid());
$$;

create function public.enforce_task_edit_rights() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then
    return new; -- SQL editor / cascades
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    return new;
  end if;

  new.created_by := old.created_by;
  new.project_id := old.project_id;
  if can_edit_task_details(old.project_id, old.created_by) then
    return new;
  end if;
  -- Everyone else allowed to update (assignees) may only move the stage and log hours.
  if (new.title, new.description, new.list_id, new.assignees, new.start_date, new.due_date, new.priority, new.labels, new.number)
     is distinct from
     (old.title, old.description, old.list_id, old.assignees, old.start_date, old.due_date, old.priority, old.labels, old.number) then
    raise exception 'Only the task’s creator, the owner or a project manager can change task details';
  end if;
  return new;
end;
$$;

create trigger task_edit_rights
  before insert or update on public.tasks
  for each row execute function public.enforce_task_edit_rights();

drop policy "editors, or assigned subcontractor, update" on public.tasks;
drop policy "editors delete" on public.tasks;

-- Updating: detail editors, or anyone (with at least "assigned tasks" access) assigned to the task.
create policy "detail editors or assignees update" on public.tasks for update
  using (can_edit_task_details(project_id, created_by)
         or (access(project_id, 'tasks') >= 2 and my_display_name() = any (assignees)))
  with check (can_edit_task_details(project_id, created_by)
              or (access(project_id, 'tasks') >= 2 and my_display_name() = any (assignees)));
create policy "detail editors delete" on public.tasks for delete
  using (can_edit_task_details(project_id, created_by));
