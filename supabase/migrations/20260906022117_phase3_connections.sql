-- Phase 3 provider connection metadata and private OAuth state.
create table if not exists public.provider_connections (
  provider text primary key check (provider in ('threads', 'rakuten')),
  status text not null default 'disconnected' check (status in ('disconnected', 'connected', 'error', 'needs_reconnect')),
  display_name text,
  external_account_id text,
  masked_identifier text,
  last_checked_at timestamptz,
  last_error_code text,
  last_error_message text check (last_error_message is null or char_length(last_error_message) <= 500),
  updated_at timestamptz not null default now()
);

create table if not exists private.oauth_states (
  state_hash text primary key,
  provider text not null check (provider in ('threads', 'rakuten')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  used_at timestamptz
);

alter table public.provider_connections enable row level security;
alter table private.oauth_states enable row level security;

revoke all on table public.provider_connections from anon, authenticated;
grant select on table public.provider_connections to authenticated;

revoke all on table private.oauth_states from public, anon, authenticated;
grant all on table private.oauth_states to service_role;

create policy "admin can read provider connections"
  on public.provider_connections for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

insert into public.provider_connections (provider)
values ('threads'), ('rakuten')
on conflict (provider) do nothing;
