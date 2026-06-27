alter table public.transactions
  add column if not exists goal_id uuid;

alter table public.transactions
  add column if not exists loan_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_goal_id_fkey'
  ) then
    alter table public.transactions
      add constraint transactions_goal_id_fkey
      foreign key (goal_id) references public.goals(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'transactions_loan_id_fkey'
  ) then
    alter table public.transactions
      add constraint transactions_loan_id_fkey
      foreign key (loan_id) references public.loans(id)
      on delete set null;
  end if;
end $$;

create index if not exists transactions_goal_id_idx
  on public.transactions (goal_id);

create index if not exists transactions_loan_id_idx
  on public.transactions (loan_id);
