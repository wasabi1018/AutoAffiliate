-- Phase 8 SALE/TRENDING selection and account-specific strategy weights.

alter table public.product_selection_evaluations
  add column if not exists selected_strategy text not null default 'RANKING'
    check (selected_strategy in ('RANKING', 'SALE', 'TRENDING')),
  add column if not exists strategy_evidence jsonb not null default '{}'::jsonb;

create table if not exists public.account_strategy_settings (
  account_id uuid primary key references public.threads_accounts (id) on delete cascade,
  ranking_weight numeric(5,2) not null default 60 check (ranking_weight between 0 and 100),
  sale_weight numeric(5,2) not null default 20 check (sale_weight between 0 and 100),
  trending_weight numeric(5,2) not null default 20 check (trending_weight between 0 and 100),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  check (ranking_weight + sale_weight + trending_weight = 100)
);

insert into public.account_strategy_settings (account_id, ranking_weight, sale_weight, trending_weight)
select id, 60, 20, 20 from public.threads_accounts
on conflict (account_id) do nothing;

create index if not exists account_strategy_settings_updated_idx
  on public.account_strategy_settings (updated_at desc);

alter table public.account_strategy_settings enable row level security;
revoke all on table public.account_strategy_settings from anon, authenticated;
grant select, insert, update, delete on table public.account_strategy_settings to authenticated;
grant all on table public.account_strategy_settings to service_role;

create policy "admin can read account strategy settings"
  on public.account_strategy_settings for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can insert account strategy settings"
  on public.account_strategy_settings for insert to authenticated
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can update account strategy settings"
  on public.account_strategy_settings for update to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can delete account strategy settings"
  on public.account_strategy_settings for delete to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
