-- Budget allocations: part of a budget line set aside for a person or a role, paid out in part or full,
-- and confirmed by the person who received each payment.
--   * Owners, project managers and quantity surveyors (budget edit access) allocate and record payments.
--   * Allocations to a role are paid to individual people who have that role on the project.
--   * Nobody records a payment to themselves unless they're the only one on the project who can make payments.
--   * The person paid confirms receipt, or reports a problem with a note.
--   * Payments count as money spent on the budget line (the app adds them to "spent").

create table public.budget_allocations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  cost_id uuid not null references public.costs on delete restrict, -- remove allocations before deleting a line
  recipient_user uuid references public.profiles on delete restrict,
  recipient_role text check (recipient_role is null or public.is_valid_role(recipient_role)),
  amount numeric not null check (amount > 0),
  purpose text not null default '',
  created_by uuid default auth.uid() references auth.users on delete set null,
  created_at timestamptz not null default now(),
  check ((recipient_user is null) <> (recipient_role is null)) -- exactly one: a person or a role
);

create table public.allocation_payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects on delete cascade,
  allocation_id uuid not null references public.budget_allocations on delete restrict, -- remove payments first
  payee uuid not null references public.profiles on delete restrict,
  date date not null default current_date,
  amount numeric not null check (amount > 0),
  method text not null default '',
  note text not null default '',
  paid_by uuid default auth.uid() references auth.users on delete set null,
  paid_by_name text not null default '',
  status text not null default 'Awaiting confirmation' check (status in ('Awaiting confirmation', 'Confirmed', 'Problem')),
  payee_note text not null default '',
  responded_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.budget_allocations (project_id);
create index on public.budget_allocations (cost_id);
create index on public.allocation_payments (project_id);
create index on public.allocation_payments (allocation_id);
create index on public.allocation_payments (payee);

-- Can the current user record a payment to `payee`? Not to themselves, unless nobody else can make payments.
create function public.can_pay(pid uuid, payee uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select access(pid, 'budget') >= 3 and (
    payee is distinct from auth.uid()
    or not exists (
      select 1 from project_members m
      where m.project_id = pid and m.user_id <> auth.uid() and role_level(m.role, 'budget') >= 3
    )
  );
$$;

create function public.prepare_allocation() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  paid numeric;
begin
  if auth.uid() is null then
    return new;
  end if;
  if not exists (select 1 from costs where id = new.cost_id and project_id = new.project_id) then
    raise exception 'That budget line isn’t on this project';
  end if;
  if new.recipient_user is not null
     and not exists (select 1 from project_members where project_id = new.project_id and user_id = new.recipient_user) then
    raise exception 'Budget can only be allocated to people on this project';
  end if;
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  else
    new.created_by := old.created_by;
    new.project_id := old.project_id;
    select coalesce(sum(amount), 0) into paid from allocation_payments where allocation_id = old.id;
    if new.amount < paid then
      raise exception 'The allocation can’t be less than what has already been paid (%)', paid;
    end if;
    if paid > 0 and (new.recipient_user, new.recipient_role) is distinct from (old.recipient_user, old.recipient_role) then
      raise exception 'Payments have been made from this allocation, so its recipient can’t change';
    end if;
  end if;
  return new;
end;
$$;

create trigger allocation_prepare
  before insert or update on public.budget_allocations
  for each row execute function public.prepare_allocation();

create function public.prepare_allocation_payment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  a budget_allocations;
  payee_role text;
  paid numeric;
begin
  if auth.uid() is null then
    return new;
  end if;
  if access(new.project_id, 'budget') < 3 then
    raise exception 'Only owners, project managers and quantity surveyors can record payments';
  end if;
  select * into a from budget_allocations where id = new.allocation_id;
  if not found or a.project_id <> new.project_id then
    raise exception 'Allocation not found';
  end if;
  select role into payee_role from project_members where project_id = new.project_id and user_id = new.payee;
  if payee_role is null then
    raise exception 'The person being paid must be on this project';
  end if;
  if a.recipient_user is not null and new.payee <> a.recipient_user then
    raise exception 'This allocation can only be paid to the person it was allocated to';
  end if;
  if a.recipient_role is not null and payee_role <> a.recipient_role then
    raise exception 'This allocation can only be paid to people with that role';
  end if;
  if not can_pay(new.project_id, new.payee) then
    raise exception 'You can’t record a payment to yourself — someone else on the project must';
  end if;
  select coalesce(sum(amount), 0) into paid from allocation_payments where allocation_id = a.id;
  if paid + new.amount > a.amount then
    raise exception 'That’s more than is left on this allocation (% remaining)', a.amount - paid;
  end if;
  new.paid_by := auth.uid();
  new.paid_by_name := my_display_name();
  new.status := 'Awaiting confirmation';
  new.payee_note := '';
  new.responded_at := null;
  return new;
end;
$$;

create trigger allocation_payment_prepare
  before insert on public.allocation_payments
  for each row execute function public.prepare_allocation_payment();

-- The person paid confirms, or reports a problem (with a note). Confirmed is final.
create function public.respond_to_payment(payment uuid, received boolean, response text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  p allocation_payments;
begin
  select * into p from allocation_payments where id = payment for update;
  if not found or p.payee <> auth.uid() then
    raise exception 'Only the person who was paid can respond to this payment';
  end if;
  if p.status = 'Confirmed' then
    raise exception 'This payment has already been confirmed';
  end if;
  if not received and coalesce(trim(response), '') = '' then
    raise exception 'Say what the problem is';
  end if;
  update allocation_payments
  set status = case when received then 'Confirmed' else 'Problem' end,
      payee_note = coalesce(response, ''),
      responded_at = now()
  where id = payment;
end;
$$;

revoke execute on function public.respond_to_payment(uuid, boolean, text) from anon, public;
grant execute on function public.respond_to_payment(uuid, boolean, text) to authenticated;

alter table public.budget_allocations enable row level security;
alter table public.allocation_payments enable row level security;

-- Budget readers see all allocations; recipients see theirs (a person's own, or their role's).
create policy "budget readers and recipients" on public.budget_allocations for select using (
  access(project_id, 'budget') >= 1 or recipient_user = auth.uid() or recipient_role = my_role(project_id));
create policy "budget editors add" on public.budget_allocations for insert with check (access(project_id, 'budget') >= 3);
create policy "budget editors update" on public.budget_allocations for update
  using (access(project_id, 'budget') >= 3) with check (access(project_id, 'budget') >= 3);
create policy "budget editors delete" on public.budget_allocations for delete using (access(project_id, 'budget') >= 3);

create policy "budget readers and the payee" on public.allocation_payments for select using (
  access(project_id, 'budget') >= 1 or payee = auth.uid());
create policy "budget editors pay" on public.allocation_payments for insert with check (access(project_id, 'budget') >= 3);
-- A payment can be removed (to correct a mistake) until the payee has confirmed it.
create policy "budget editors remove unconfirmed" on public.allocation_payments for delete using (
  access(project_id, 'budget') >= 3 and status <> 'Confirmed');
-- No update policy: payees respond through respond_to_payment().

grant select, insert, update, delete on public.budget_allocations to authenticated;
grant select, insert, delete on public.allocation_payments to authenticated;
alter publication supabase_realtime add table public.budget_allocations, public.allocation_payments;
