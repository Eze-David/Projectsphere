-- Approvals: an Approver role, expense approval, and budget change requests.
-- The rules are enforced here (not only in the app), so they hold however a request is sent.
-- Admin work in the SQL editor (no signed-in user) is not restricted.

-- ---------- Roles: owner, approver, member ----------

alter table public.project_members drop constraint project_members_role_check;
alter table public.project_members add constraint project_members_role_check
  check (role in ('owner', 'approver', 'member'));

create function public.can_approve(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from project_members where project_id = pid and user_id = auth.uid() and role in ('owner', 'approver')
  );
$$;

-- Approving something someone else submitted. Your own only if nobody else on the project can approve.
create function public.can_approve_for(pid uuid, submitter uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select can_approve(pid) and (
    submitter is distinct from auth.uid()
    or not exists (
      select 1 from project_members
      where project_id = pid and role in ('owner', 'approver') and user_id <> auth.uid()
    )
  );
$$;

create function public.my_display_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(full_name, ''), email, '') from profiles where id = auth.uid();
$$;

create function public.set_member_role(pid uuid, member uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_owner(pid) then
    raise exception 'Only project owners can change roles';
  end if;
  if member = auth.uid() then
    raise exception 'You can’t change your own role';
  end if;
  if new_role not in ('owner', 'approver', 'member') then
    raise exception 'Unknown role';
  end if;
  update project_members set role = new_role where project_id = pid and user_id = member;
end;
$$;

revoke execute on function public.set_member_role(uuid, uuid, text) from anon, public;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

-- ---------- Expense approval ----------

alter table public.expenses
  add column approved_by uuid references auth.users on delete set null,
  add column approved_by_name text not null default '',
  add column approved_at timestamptz,
  add column rejection_reason text not null default '';

alter table public.expenses add constraint expenses_status_check
  check (status in ('Pending', 'Approved', 'Rejected', 'Paid'));

create function public.enforce_expense_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
begin
  -- SQL editor / service role, and cascades (e.g. a deleted budget line unlinking expenses)
  if me is null or pg_trigger_depth() > 1 then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := me;
    new.status := 'Pending';
    new.approved_by := null;
    new.approved_by_name := '';
    new.approved_at := null;
    new.rejection_reason := '';
    return new;
  end if;

  new.created_by := old.created_by;
  new.project_id := old.project_id;

  if new.status is distinct from old.status then
    if new.status in ('Approved', 'Rejected') then
      if not can_approve_for(old.project_id, old.created_by) then
        raise exception 'You can’t approve or reject this expense';
      end if;
      if new.status = 'Rejected' and coalesce(trim(new.rejection_reason), '') = '' then
        raise exception 'Give a reason for rejecting this expense';
      end if;
      new.approved_by := me;
      new.approved_by_name := my_display_name();
      new.approved_at := now();
      if new.status = 'Approved' then
        new.rejection_reason := '';
      end if;
    elsif new.status = 'Paid' then
      if not can_approve(old.project_id) then
        raise exception 'Only owners and approvers can mark expenses as paid';
      end if;
      if old.status <> 'Approved' then
        raise exception 'An expense must be approved before it is marked paid';
      end if;
      new.approved_by := old.approved_by;
      new.approved_by_name := old.approved_by_name;
      new.approved_at := old.approved_at;
      new.rejection_reason := '';
    else -- back to Pending (resubmitted)
      new.approved_by := null;
      new.approved_by_name := '';
      new.approved_at := null;
      new.rejection_reason := '';
    end if;
    return new;
  end if;

  -- Status unchanged: approval details can't be edited directly.
  new.approved_by := old.approved_by;
  new.approved_by_name := old.approved_by_name;
  new.approved_at := old.approved_at;
  new.rejection_reason := old.rejection_reason;

  -- Changing an approved/paid/rejected expense sends it back for approval, unless an eligible approver made the change.
  if old.status <> 'Pending'
     and (new.amount, new.cost_id, new.category, new.description, new.vendor, new.date)
         is distinct from (old.amount, old.cost_id, old.category, old.description, old.vendor, old.date)
     and not can_approve_for(old.project_id, old.created_by) then
    new.status := 'Pending';
    new.approved_by := null;
    new.approved_by_name := '';
    new.approved_at := null;
    new.rejection_reason := '';
  end if;
  return new;
end;
$$;

create trigger expense_approval
  before insert or update on public.expenses
  for each row execute function public.enforce_expense_approval();

drop policy "members" on public.expenses;
create policy "members read" on public.expenses for select using (is_member(project_id));
create policy "members submit" on public.expenses for insert with check (is_member(project_id));
create policy "submitter or approver edits" on public.expenses for update
  using (can_approve(project_id) or created_by = auth.uid())
  with check (is_member(project_id));
create policy "approver, or submitter while pending, deletes" on public.expenses for delete
  using (can_approve(project_id) or (created_by = auth.uid() and status = 'Pending'));

-- ---------- Budget: only owners/approvers change it; members request changes ----------

drop policy "members" on public.costs;
create policy "members read" on public.costs for select using (is_member(project_id));
create policy "approvers add" on public.costs for insert with check (can_approve(project_id));
create policy "approvers edit" on public.costs for update using (can_approve(project_id)) with check (can_approve(project_id));
create policy "approvers delete" on public.costs for delete using (can_approve(project_id));

create function public.enforce_contract_value() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.budget is distinct from old.budget and not can_approve(old.id) then
    raise exception 'Only owners and approvers can change the contract value';
  end if;
  return new;
end;
$$;

create trigger contract_value_guard
  before update on public.projects
  for each row execute function public.enforce_contract_value();

create table public.budget_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  cost_id uuid references public.costs on delete cascade, -- null = request for a new line item
  code text not null default '',
  description text not null default '',
  current_amount numeric not null default 0,
  amount numeric not null default 0,
  reason text not null default '',
  status text not null default 'Pending' check (status in ('Pending', 'Approved', 'Rejected')),
  requested_by uuid default auth.uid() references auth.users on delete set null,
  requested_by_name text not null default '',
  decided_by uuid references auth.users on delete set null,
  decided_by_name text not null default '',
  decided_at timestamptz,
  decision_note text not null default '',
  created_at timestamptz not null default now()
);

create index on public.budget_requests (project_id);

create function public.prepare_budget_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  new.requested_by := auth.uid();
  new.requested_by_name := my_display_name();
  new.status := 'Pending';
  new.decided_by := null;
  new.decided_by_name := '';
  new.decided_at := null;
  new.decision_note := '';
  if new.cost_id is not null then
    select code, description, budgeted into new.code, new.description, new.current_amount
    from costs where id = new.cost_id and project_id = new.project_id;
    if not found then
      raise exception 'That budget line doesn’t exist';
    end if;
  else
    new.current_amount := 0;
    if coalesce(trim(new.code), '') = '' or coalesce(trim(new.description), '') = '' then
      raise exception 'A new line item needs a cost code and description';
    end if;
  end if;
  if coalesce(trim(new.reason), '') = '' then
    raise exception 'Give a reason for the change';
  end if;
  return new;
end;
$$;

create trigger budget_request_prepare
  before insert on public.budget_requests
  for each row execute function public.prepare_budget_request();

alter table public.budget_requests enable row level security;
create policy "members read" on public.budget_requests for select using (is_member(project_id));
create policy "members request" on public.budget_requests for insert with check (is_member(project_id));
create policy "requester withdraws, approver deletes" on public.budget_requests for delete
  using (can_approve(project_id) or (requested_by = auth.uid() and status = 'Pending'));
-- No update policy: requests are decided only through decide_budget_request().

create function public.decide_budget_request(rid uuid, approve boolean, note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  r budget_requests;
begin
  select * into r from budget_requests where id = rid for update;
  if not found then
    raise exception 'Request not found';
  end if;
  if r.status <> 'Pending' then
    raise exception 'This request has already been decided';
  end if;
  if not can_approve_for(r.project_id, r.requested_by) then
    raise exception 'You can’t decide this request';
  end if;
  if not approve and coalesce(trim(note), '') = '' then
    raise exception 'Give a reason for rejecting';
  end if;

  if approve then
    if r.cost_id is null then
      insert into costs (project_id, code, description, budgeted) values (r.project_id, r.code, r.description, r.amount);
    else
      update costs set budgeted = r.amount where id = r.cost_id;
    end if;
  end if;

  update budget_requests
  set status = case when approve then 'Approved' else 'Rejected' end,
      decided_by = auth.uid(),
      decided_by_name = my_display_name(),
      decided_at = now(),
      decision_note = coalesce(note, '')
  where id = rid;
end;
$$;

revoke execute on function public.decide_budget_request(uuid, boolean, text) from anon, public;
grant execute on function public.decide_budget_request(uuid, boolean, text) to authenticated;

grant select, insert, delete on public.budget_requests to authenticated;
alter publication supabase_realtime add table public.budget_requests;
