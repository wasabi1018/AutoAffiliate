-- Phase 7 insights collection, snapshots, and analysis dimensions.

alter table public.post_set_posts
  add column if not exists product_id uuid references public.products (id) on delete set null,
  add column if not exists strategy text,
  add column if not exists hook text,
  add column if not exists template_id uuid references public.post_templates (id) on delete set null,
  add column if not exists published_at timestamptz;

create index if not exists post_set_posts_product_idx
  on public.post_set_posts (product_id)
  where product_id is not null;

create table if not exists public.post_insight_jobs (
  id uuid primary key default gen_random_uuid(),
  post_set_post_id uuid not null references public.post_set_posts (id) on delete cascade,
  account_id uuid not null references public.threads_accounts (id) on delete cascade,
  post_id text not null,
  window_label text not null check (window_label in ('1h', '6h', '24h', '72h')),
  scheduled_for timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error_code text,
  last_error_message text check (last_error_message is null or char_length(last_error_message) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_set_post_id, window_label)
);

create index if not exists post_insight_jobs_due_idx
  on public.post_insight_jobs (status, next_attempt_at, scheduled_for);

create table if not exists public.post_insight_snapshots (
  id uuid primary key default gen_random_uuid(),
  insight_job_id uuid not null unique references public.post_insight_jobs (id) on delete cascade,
  post_set_post_id uuid not null references public.post_set_posts (id) on delete cascade,
  account_id uuid not null references public.threads_accounts (id) on delete cascade,
  post_id text not null,
  window_label text not null check (window_label in ('1h', '6h', '24h', '72h')),
  captured_at timestamptz not null default now(),
  metrics_status text not null check (metrics_status in ('available', 'partial', 'unavailable')),
  metric_names text[] not null default '{}',
  views bigint check (views is null or views >= 0),
  likes bigint check (likes is null or likes >= 0),
  replies bigint check (replies is null or replies >= 0),
  reposts bigint check (reposts is null or reposts >= 0),
  quotes bigint check (quotes is null or quotes >= 0),
  shares bigint check (shares is null or shares >= 0),
  clicks bigint check (clicks is null or clicks >= 0),
  ctr numeric(8,4) check (ctr is null or ctr >= 0),
  created_at timestamptz not null default now()
);

create index if not exists post_insight_snapshots_post_captured_idx
  on public.post_insight_snapshots (post_set_post_id, captured_at desc);

create index if not exists post_insight_snapshots_account_captured_idx
  on public.post_insight_snapshots (account_id, captured_at desc);

alter table public.post_insight_jobs enable row level security;
alter table public.post_insight_snapshots enable row level security;

revoke all on table public.post_insight_jobs, public.post_insight_snapshots from anon, authenticated;
grant select on table public.post_insight_jobs, public.post_insight_snapshots to authenticated;
grant all on table public.post_insight_jobs, public.post_insight_snapshots to service_role;

create policy "admin can read insights jobs"
  on public.post_insight_jobs for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can read insights snapshots"
  on public.post_insight_snapshots for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
