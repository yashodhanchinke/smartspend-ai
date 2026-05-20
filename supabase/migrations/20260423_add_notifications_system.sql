create table if not exists public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default false,
  push_permission_status text not null default 'unknown',
  expo_push_token text,
  language_mode text not null default 'hinglish',
  last_generated_at timestamp with time zone,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now()),
  constraint notification_preferences_language_mode_check
    check (language_mode in ('english', 'hinglish'))
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint text not null,
  title text not null,
  body text not null,
  tone text not null default 'attention',
  language text not null default 'hinglish',
  kind text not null default 'nudge',
  source_module text,
  source_entity_type text,
  source_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  read_at timestamp with time zone,
  expires_at timestamp with time zone,
  push_attempted_at timestamp with time zone,
  push_sent_at timestamp with time zone,
  push_error text,
  constraint notifications_user_fingerprint_unique unique (user_id, fingerprint)
);

create index if not exists notifications_user_created_at_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_read_expiry_idx
  on public.notifications (user_id, read_at, expires_at);

create or replace function public.set_notification_preferences_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$;

drop trigger if exists notification_preferences_set_updated_at on public.notification_preferences;

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row
execute function public.set_notification_preferences_updated_at();

alter table public.notification_preferences enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "Users can view their own notification preferences" on public.notification_preferences;
create policy "Users can view their own notification preferences"
on public.notification_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own notification preferences" on public.notification_preferences;
create policy "Users can insert their own notification preferences"
on public.notification_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own notification preferences" on public.notification_preferences;
create policy "Users can update their own notification preferences"
on public.notification_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can view their own notifications" on public.notifications;
create policy "Users can view their own notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can update their own notifications" on public.notifications;
create policy "Users can update their own notifications"
on public.notifications
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
