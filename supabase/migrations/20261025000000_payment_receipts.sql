-- Receipts on allocation payments: files attached to a payment, visible to budget readers and the person paid.

alter table public.attachments drop constraint attachments_entity_type_check;
alter table public.attachments add constraint attachments_entity_type_check
  check (entity_type in ('expense', 'material', 'equipment', 'log', 'rfi', 'task', 'invoice', 'payment'));

create or replace function public.attachment_area(t text) returns text
language sql immutable as $$
  select case t
    when 'expense' then 'expenses' when 'invoice' then 'finance' when 'material' then 'site'
    when 'equipment' then 'site' when 'log' then 'logs' when 'rfi' then 'rfis' when 'task' then 'tasks'
    when 'payment' then 'budget' end;
$$;

-- Runs with the caller's own row-level security, so a payment's receipt is visible exactly when the payment is.
create or replace function public.can_see_record(t text, rid uuid) returns boolean
language sql stable set search_path = public as $$
  select case t
    when 'expense' then exists (select 1 from expenses where id = rid)
    when 'invoice' then exists (select 1 from invoices where id = rid)
    when 'material' then exists (select 1 from materials where id = rid)
    when 'equipment' then exists (select 1 from equipment where id = rid)
    when 'log' then exists (select 1 from daily_logs where id = rid)
    when 'rfi' then exists (select 1 from rfis where id = rid)
    when 'task' then exists (select 1 from tasks where id = rid)
    when 'payment' then exists (select 1 from allocation_payments where id = rid)
    else false end;
$$;

create or replace function public.can_upload_file(object_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when split_part(object_name, '/', 1) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then false
    when split_part(object_name, '/', 2) = 'attachments' then
      greatest(access(split_part(object_name, '/', 1)::uuid, 'tasks'), access(split_part(object_name, '/', 1)::uuid, 'logs'),
               access(split_part(object_name, '/', 1)::uuid, 'expenses'), access(split_part(object_name, '/', 1)::uuid, 'rfis'),
               access(split_part(object_name, '/', 1)::uuid, 'site'), access(split_part(object_name, '/', 1)::uuid, 'finance'),
               access(split_part(object_name, '/', 1)::uuid, 'budget')) >= 2
    else access(split_part(object_name, '/', 1)::uuid, 'documents') >= 3
  end;
$$;
