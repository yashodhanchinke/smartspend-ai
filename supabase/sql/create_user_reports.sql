create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('reports', 'reports', false)
on conflict (id) do update set public = excluded.public;

create table if not exists public.user_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email_to text,
  filename text not null,
  storage_path text not null unique,
  report_label text,
  range_start date,
  range_end date,
  filter_snapshot jsonb not null default '{}'::jsonb,
  summary_text text,
  advice_text text,
  email_status text not null default 'pending',
  is_automatic boolean not null default false,
  generated_for_month text,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists user_reports_auto_month_unique_idx
on public.user_reports (user_id, generated_for_month)
where is_automatic = true and generated_for_month is not null;

create index if not exists user_reports_user_created_at_idx
on public.user_reports (user_id, created_at desc);

alter table public.user_reports enable row level security;

create policy "Users can view their own reports"
on public.user_reports
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert their own reports"
on public.user_reports
for insert
to authenticated
with check (auth.uid() = user_id);
