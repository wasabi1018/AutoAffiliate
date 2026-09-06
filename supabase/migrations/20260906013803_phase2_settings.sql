-- Phase 2 settings and operations foundation.
alter table public.app_settings
  add column if not exists global_stop boolean not null default false;

create table if not exists public.threads_accounts (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  handle text not null check (handle ~ '^[A-Za-z0-9._]{1,30}$'),
  genre text not null check (char_length(trim(genre)) between 1 and 80),
  status text not null default 'active' check (status in ('active', 'paused', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (handle)
);

create table if not exists public.threads_account_genre_history (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.threads_accounts (id) on delete cascade,
  genre text not null check (char_length(trim(genre)) between 1 and 80),
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users (id)
);

create index if not exists threads_account_genre_history_account_changed_idx
  on public.threads_account_genre_history (account_id, changed_at desc);

create table if not exists public.strategy_settings (
  id boolean primary key default true check (id),
  ranking_weight numeric(5,2) not null default 60 check (ranking_weight between 0 and 100),
  sale_weight numeric(5,2) not null default 20 check (sale_weight between 0 and 100),
  trending_weight numeric(5,2) not null default 20 check (trending_weight between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  check (ranking_weight + sale_weight + trending_weight = 100)
);

create table if not exists public.strategy_settings_history (
  id uuid primary key default gen_random_uuid(),
  ranking_weight numeric(5,2) not null check (ranking_weight between 0 and 100),
  sale_weight numeric(5,2) not null check (sale_weight between 0 and 100),
  trending_weight numeric(5,2) not null check (trending_weight between 0 and 100),
  changed_at timestamptz not null default now(),
  changed_by uuid not null references auth.users (id),
  check (ranking_weight + sale_weight + trending_weight = 100)
);

create table if not exists public.product_filters (
  id boolean primary key default true check (id),
  min_price numeric(12,2) not null default 0 check (min_price >= 0),
  max_price numeric(12,2) check (max_price is null or max_price >= min_price),
  require_in_stock boolean not null default true,
  min_review_count integer not null default 0 check (min_review_count >= 0),
  excluded_words text[] not null default '{}',
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id)
);

create table if not exists public.post_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  template_type text not null check (template_type in ('hook', 'reply')),
  body text not null check (char_length(trim(body)) between 1 and 1000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, template_type)
);

create table if not exists public.posting_schedules (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.threads_accounts (id) on delete cascade,
  weekdays smallint[] not null check (
    cardinality(weekdays) > 0
    and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  ),
  posting_times time[] not null check (cardinality(posting_times) > 0),
  timezone text not null check (char_length(trim(timezone)) between 1 and 80),
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.strategy_settings (id)
values (true)
on conflict (id) do nothing;

insert into public.product_filters (id)
values (true)
on conflict (id) do nothing;

alter table public.threads_accounts enable row level security;
alter table public.threads_account_genre_history enable row level security;
alter table public.strategy_settings enable row level security;
alter table public.strategy_settings_history enable row level security;
alter table public.product_filters enable row level security;
alter table public.post_templates enable row level security;
alter table public.posting_schedules enable row level security;

revoke all on table public.threads_accounts, public.threads_account_genre_history,
  public.strategy_settings, public.strategy_settings_history, public.product_filters,
  public.post_templates, public.posting_schedules from anon, authenticated;

grant select, insert, update, delete on table public.threads_accounts to authenticated;
grant select, insert on table public.threads_account_genre_history to authenticated;
grant select, insert, update, delete on table public.strategy_settings to authenticated;
grant select, insert on table public.strategy_settings_history to authenticated;
grant select, insert, update, delete on table public.product_filters to authenticated;
grant select, insert, update, delete on table public.post_templates to authenticated;
grant select, insert, update, delete on table public.posting_schedules to authenticated;

create policy "admin can read threads accounts"
  on public.threads_accounts for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can insert threads accounts"
  on public.threads_accounts for insert to authenticated
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can update threads accounts"
  on public.threads_accounts for update to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can delete threads accounts"
  on public.threads_accounts for delete to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can read genre history"
  on public.threads_account_genre_history for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can insert genre history"
  on public.threads_account_genre_history for insert to authenticated
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can read strategy settings"
  on public.strategy_settings for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can insert strategy settings"
  on public.strategy_settings for insert to authenticated
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can update strategy settings"
  on public.strategy_settings for update to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can delete strategy settings"
  on public.strategy_settings for delete to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can read strategy history"
  on public.strategy_settings_history for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can insert strategy history"
  on public.strategy_settings_history for insert to authenticated
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can read product filters"
  on public.product_filters for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can insert product filters"
  on public.product_filters for insert to authenticated
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can update product filters"
  on public.product_filters for update to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can delete product filters"
  on public.product_filters for delete to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can read post templates"
  on public.post_templates for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can insert post templates"
  on public.post_templates for insert to authenticated
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can update post templates"
  on public.post_templates for update to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can delete post templates"
  on public.post_templates for delete to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can read posting schedules"
  on public.posting_schedules for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can insert posting schedules"
  on public.posting_schedules for insert to authenticated
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can update posting schedules"
  on public.posting_schedules for update to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
create policy "admin can delete posting schedules"
  on public.posting_schedules for delete to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
