alter table public.loans
  add column if not exists status text default 'pending',
  add column if not exists settled_at timestamp without time zone,
  add column if not exists settlement_transaction_id uuid references public.transactions(id),
  add column if not exists settlement_account_id uuid references public.accounts(id);

update public.loans
set status = 'pending'
where status is null;

create index if not exists loans_user_status_end_date_idx
  on public.loans (user_id, status, end_date);

