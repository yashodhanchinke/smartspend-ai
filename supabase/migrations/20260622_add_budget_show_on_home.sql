alter table public.budgets
  add column if not exists show_on_home boolean default false;
