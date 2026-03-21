alter table public.ai_insights enable row level security;

create policy "Users can view their own ai insights"
on public.ai_insights
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own ai insights"
on public.ai_insights
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own ai insights"
on public.ai_insights
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own ai insights"
on public.ai_insights
for delete
to authenticated
using (auth.uid() = user_id);
