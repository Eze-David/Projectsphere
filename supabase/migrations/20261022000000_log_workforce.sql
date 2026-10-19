-- Daily logs: workers on site by trade, e.g. [{"trade": "Mason", "count": 6}, {"trade": "Labourer", "count": 10}].
-- `crew` stays as the total.
alter table public.daily_logs add column workforce jsonb not null default '[]'::jsonb;
