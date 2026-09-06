-- Phase 4 ranking ingestion, normalized products, and dry-run evaluations.

create table if not exists public.ranking_history (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('rakuten')),
  genre_id bigint,
  captured_at timestamptz not null default now(),
  source_last_build_date text,
  request_params jsonb not null default '{}'::jsonb,
  item_count integer not null default 0 check (item_count >= 0),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists ranking_history_provider_captured_idx
  on public.ranking_history (provider, captured_at desc);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('rakuten')),
  external_item_code text not null,
  name text not null,
  item_url text,
  affiliate_url text,
  image_url text,
  price numeric(12,2) not null check (price >= 0),
  availability boolean not null default false,
  review_count integer not null default 0 check (review_count >= 0),
  review_average numeric(4,2),
  genre_id bigint,
  shop_name text,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_item_code)
);

create index if not exists products_last_seen_idx
  on public.products (last_seen_at desc);

create table if not exists public.product_snapshots (
  id uuid primary key default gen_random_uuid(),
  ranking_history_id uuid not null references public.ranking_history (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  rank integer not null check (rank > 0),
  name text not null,
  price numeric(12,2) not null check (price >= 0),
  availability boolean not null default false,
  review_count integer not null default 0 check (review_count >= 0),
  review_average numeric(4,2),
  item_url text,
  affiliate_url text,
  image_url text,
  sale_start_time timestamptz,
  sale_end_time timestamptz,
  point_rate numeric(8,2),
  captured_at timestamptz not null default now(),
  unique (ranking_history_id, product_id)
);

create index if not exists product_snapshots_history_rank_idx
  on public.product_snapshots (ranking_history_id, rank);

create table if not exists public.product_selection_evaluations (
  id uuid primary key default gen_random_uuid(),
  ranking_history_id uuid not null references public.ranking_history (id) on delete cascade,
  snapshot_id uuid not null references public.product_snapshots (id) on delete cascade,
  eligible boolean not null,
  score numeric(7,2) not null check (score >= 0 and score <= 100),
  ranking_score numeric(7,2) not null check (ranking_score >= 0 and ranking_score <= 100),
  sale_score numeric(7,2) not null check (sale_score >= 0 and sale_score <= 100),
  trending_score numeric(7,2) not null check (trending_score >= 0 and trending_score <= 100),
  reasons text[] not null default '{}',
  evaluated_at timestamptz not null default now(),
  unique (snapshot_id)
);

create index if not exists product_selection_evaluations_history_score_idx
  on public.product_selection_evaluations (ranking_history_id, eligible, score desc);

alter table public.ranking_history enable row level security;
alter table public.products enable row level security;
alter table public.product_snapshots enable row level security;
alter table public.product_selection_evaluations enable row level security;

revoke all on table public.ranking_history, public.products, public.product_snapshots,
  public.product_selection_evaluations from anon, authenticated;

grant select on table public.ranking_history, public.products, public.product_snapshots,
  public.product_selection_evaluations to authenticated;

grant all on table public.ranking_history, public.products, public.product_snapshots,
  public.product_selection_evaluations to service_role;

create policy "admin can read ranking history"
  on public.ranking_history for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can read products"
  on public.products for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can read product snapshots"
  on public.product_snapshots for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can read product evaluations"
  on public.product_selection_evaluations for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
