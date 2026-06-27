create table if not exists public.transaction_labels (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  label_id uuid not null references public.labels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp without time zone default now(),
  constraint transaction_labels_pkey primary key (transaction_id, label_id)
);

create index if not exists transaction_labels_transaction_id_idx
  on public.transaction_labels (transaction_id);

create index if not exists transaction_labels_label_id_idx
  on public.transaction_labels (label_id);

create index if not exists transaction_labels_user_id_idx
  on public.transaction_labels (user_id);

alter table public.transaction_labels enable row level security;

drop policy if exists "Users can view their own transaction labels" on public.transaction_labels;
create policy "Users can view their own transaction labels"
on public.transaction_labels
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own transaction labels" on public.transaction_labels;
create policy "Users can insert their own transaction labels"
on public.transaction_labels
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own transaction labels" on public.transaction_labels;
create policy "Users can update their own transaction labels"
on public.transaction_labels
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own transaction labels" on public.transaction_labels;
create policy "Users can delete their own transaction labels"
on public.transaction_labels
for delete
to authenticated
using (auth.uid() = user_id);
