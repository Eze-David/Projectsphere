-- Invoice payments: an invoice can be paid in parts, e.g. [{"date": "2026-10-18", "amount": 500000, "method": "Bank transfer"}].
-- Outstanding = amount − sum of payments. Status becomes "Part paid" / "Paid" automatically in the app.
alter table public.invoices add column payments jsonb not null default '[]'::jsonb;

-- Invoices already marked Paid become one full payment, so totals stay the same.
update public.invoices
set payments = jsonb_build_array(jsonb_build_object('date', coalesce(paid_date, date), 'amount', amount, 'method', ''))
where status = 'Paid' and payments = '[]'::jsonb;
