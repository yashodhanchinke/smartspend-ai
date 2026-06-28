alter table public.transactions enable row level security;
alter table public.accounts enable row level security;

drop policy if exists "Users can view their own transactions" on public.transactions;
create policy "Users can view their own transactions"
on public.transactions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own transactions" on public.transactions;
create policy "Users can insert their own transactions"
on public.transactions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own transactions" on public.transactions;
create policy "Users can update their own transactions"
on public.transactions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own transactions" on public.transactions;
create policy "Users can delete their own transactions"
on public.transactions
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can view their own accounts" on public.accounts;
create policy "Users can view their own accounts"
on public.accounts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own accounts" on public.accounts;
create policy "Users can insert their own accounts"
on public.accounts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own accounts" on public.accounts;
create policy "Users can update their own accounts"
on public.accounts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own accounts" on public.accounts;
create policy "Users can delete their own accounts"
on public.accounts
for delete
to authenticated
using (auth.uid() = user_id);
