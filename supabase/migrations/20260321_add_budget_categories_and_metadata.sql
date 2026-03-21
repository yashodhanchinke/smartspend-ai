alter table public.budgets
  add column if not exists mode text default 'automatic',
  add column if not exists budget_type text default 'category',
  add column if not exists notes text,
  add column if not exists color text default '#FF4433';

create table if not exists public.budget_categories (
  budget_id uuid not null references public.budgets(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamp without time zone default now(),
  constraint budget_categories_pkey primary key (budget_id, category_id)
);

create index if not exists budget_categories_budget_id_idx
  on public.budget_categories (budget_id);

create index if not exists budget_categories_category_id_idx
  on public.budget_categories (category_id);
