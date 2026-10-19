-- Allow files (e.g. a scan or photo of the invoice) to be attached to client invoices.
alter table public.attachments drop constraint attachments_entity_type_check;
alter table public.attachments add constraint attachments_entity_type_check
  check (entity_type in ('expense', 'material', 'equipment', 'log', 'rfi', 'task', 'invoice'));
