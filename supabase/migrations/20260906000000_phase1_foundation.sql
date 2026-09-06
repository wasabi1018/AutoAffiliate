-- Phase 1 foundation: explicit API exposure, admin-only access, and secret isolation.

create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
grant usage on schema private to service_role;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id boolean primary key default true check (id),
  environment text not null default 'local' check (environment in ('local', 'preview', 'production')),
  dry_run boolean not null default true,
  auto_posting_enabled boolean not null default false,
  emergency_stop boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.integration_secrets (
  provider text primary key check (provider in ('threads', 'rakuten')),
  ciphertext bytea not null,
  key_version integer not null default 1 check (key_version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;
alter table public.app_settings enable row level security;
alter table private.integration_secrets enable row level security;

revoke all on table public.admin_users from anon;
revoke all on table public.app_settings from anon;
revoke all on table private.integration_secrets from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on table public.admin_users to authenticated;
grant select, insert, update, delete on table public.app_settings to authenticated;
grant all on table private.integration_secrets to service_role;

create policy "admin can read own admin record"
  on public.admin_users
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "admin can read settings"
  on public.app_settings
  for select
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can insert settings"
  on public.app_settings
  for insert
  to authenticated
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can update settings"
  on public.app_settings
  for update
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can delete settings"
  on public.app_settings
  for delete
  to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

insert into public.app_settings (id)
values (true)
on conflict (id) do nothing;
