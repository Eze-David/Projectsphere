-- More job roles: architect, structural/mechanical/electrical engineers (design consultants) and mason.

create function public.is_valid_role(r text) returns boolean
language sql immutable as $$
  select r in ('owner', 'project_manager', 'quantity_surveyor', 'architect', 'structural_engineer', 'mechanical_engineer',
               'electrical_engineer', 'site_engineer', 'subcontractor', 'mason', 'client');
$$;

alter table public.project_members drop constraint project_members_role_check;
alter table public.project_members add constraint project_members_role_check check (public.is_valid_role(role));
alter table public.project_invites drop constraint project_invites_role_check;
alter table public.project_invites add constraint project_invites_role_check check (public.is_valid_role(role));

-- The access table. Keep in sync with ACCESS in src/store.jsx.
-- Levels: 0 hidden · 1 view · 2 limited (add/submit/request, or own/assigned only) · 3 edit · 4 approve/manage
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
      ('tasks',      4,    3, 1, 3,   3,     3,   3,   3, 2,  2,    1),
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

create or replace function public.invite_member(pid uuid, invite_email text, invite_role text default 'site_engineer') returns text
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(invite_email));
  uid uuid;
begin
  if access(pid, 'team') < 3 then
    raise exception 'You can’t invite people to this project';
  end if;
  if not is_valid_role(invite_role) then
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

create or replace function public.set_member_role(pid uuid, member uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(pid) then
    raise exception 'Only project owners can change roles';
  end if;
  if member = auth.uid() then
    raise exception 'You can’t change your own role';
  end if;
  if not is_valid_role(new_role) then
    raise exception 'Unknown role';
  end if;
  update project_members set role = new_role where project_id = pid and user_id = member;
end;
$$;
