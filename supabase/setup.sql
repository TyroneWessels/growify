-- Run in the Supabase SQL Editor for the Growify project.
create table if not exists public.sproutly_user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"savedPlants":[],"plantProfiles":{},"completedTasks":[],"careOverrides":{}}'::jsonb,
  constraint sproutly_state_is_object check (jsonb_typeof(state) = 'object')
);

alter table public.sproutly_user_data enable row level security;
revoke all on public.sproutly_user_data from anon, authenticated;
grant select, insert, update, delete on public.sproutly_user_data to authenticated;

drop policy if exists "Users read their own plant data" on public.sproutly_user_data;
drop policy if exists "Users create their own plant data" on public.sproutly_user_data;
drop policy if exists "Users update their own plant data" on public.sproutly_user_data;
drop policy if exists "Users delete their own plant data" on public.sproutly_user_data;

create policy "Users read their own plant data"
  on public.sproutly_user_data for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own plant data"
  on public.sproutly_user_data for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own plant data"
  on public.sproutly_user_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete their own plant data"
  on public.sproutly_user_data for delete to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.sproutly_push_subscriptions (
  endpoint text primary key check (endpoint like 'https://%'),
  user_id uuid not null references auth.users(id) on delete cascade,
  p256dh text not null check (length(p256dh) between 1 and 200),
  auth text not null check (length(auth) between 1 and 200),
  time_zone text not null default 'Europe/Amsterdam',
  preferred_time text not null default '18:00',
  last_sent_date date,
  created_at timestamptz not null default now()
);

alter table public.sproutly_push_subscriptions
  add column if not exists time_zone text not null default 'Europe/Amsterdam',
  add column if not exists preferred_time text not null default '18:00',
  add column if not exists last_sent_date date;

alter table public.sproutly_push_subscriptions enable row level security;
revoke all on public.sproutly_push_subscriptions from anon, authenticated;
grant select, insert, update, delete on public.sproutly_push_subscriptions to authenticated;

drop policy if exists "Users read their own push subscriptions" on public.sproutly_push_subscriptions;
drop policy if exists "Users create their own push subscriptions" on public.sproutly_push_subscriptions;
drop policy if exists "Users update their own push subscriptions" on public.sproutly_push_subscriptions;
drop policy if exists "Users delete their own push subscriptions" on public.sproutly_push_subscriptions;

create policy "Users read their own push subscriptions"
  on public.sproutly_push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own push subscriptions"
  on public.sproutly_push_subscriptions for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own push subscriptions"
  on public.sproutly_push_subscriptions for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete their own push subscriptions"
  on public.sproutly_push_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.delete_own_sproutly_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Login required';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_own_sproutly_account() from public, anon;
grant execute on function public.delete_own_sproutly_account() to authenticated;

create or replace function public.save_sproutly_state(expected_state jsonb, new_state jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.sproutly_user_data
  set state = new_state
  where user_id = auth.uid() and state = expected_state;
  return found;
end;
$$;
revoke all on function public.save_sproutly_state(jsonb, jsonb) from public, anon;
grant execute on function public.save_sproutly_state(jsonb, jsonb) to authenticated;
