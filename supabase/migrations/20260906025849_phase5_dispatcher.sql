-- Phase 5 scheduling and dispatcher foundation. Publishing remains disabled.

alter table public.threads_accounts
  add column if not exists daily_post_limit smallint not null default 3
    check (daily_post_limit between 0 and 100),
  add column if not exists min_post_interval_minutes integer not null default 60
    check (min_post_interval_minutes between 0 and 1440);

create table if not exists public.post_sets (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.threads_accounts (id) on delete cascade,
  scheduled_for timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'dry_run', 'succeeded', 'partial_failure', 'failed', 'cancelled', 'dead_letter')),
  idempotency_key text not null unique,
  content_payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  last_error_message text check (last_error_message is null or char_length(last_error_message) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists post_sets_due_idx
  on public.post_sets (status, scheduled_for);

create table if not exists public.posting_jobs (
  id uuid primary key default gen_random_uuid(),
  post_set_id uuid not null references public.post_sets (id) on delete cascade,
  account_id uuid not null references public.threads_accounts (id) on delete cascade,
  job_key text not null unique,
  scheduled_for timestamptz not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'dry_run', 'succeeded', 'failed', 'cancelled', 'dead_letter')),
  payload jsonb not null default '{}'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  last_error_code text,
  last_error_message text check (last_error_message is null or char_length(last_error_message) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists posting_jobs_due_idx
  on public.posting_jobs (status, next_attempt_at, scheduled_for);

create index if not exists posting_jobs_account_finished_idx
  on public.posting_jobs (account_id, finished_at desc);

create table if not exists public.post_attempts (
  id uuid primary key default gen_random_uuid(),
  posting_job_id uuid not null references public.posting_jobs (id) on delete cascade,
  attempt_no integer not null check (attempt_no > 0),
  status text not null check (status in ('dry_run', 'succeeded', 'failed', 'skipped')),
  error_code text,
  error_message text check (error_message is null or char_length(error_message) <= 500),
  response_metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  retention_expires_at timestamptz not null default (now() + interval '31 days'),
  unique (posting_job_id, attempt_no)
);

create index if not exists post_attempts_retention_idx
  on public.post_attempts (retention_expires_at);

alter table public.post_sets enable row level security;
alter table public.posting_jobs enable row level security;
alter table public.post_attempts enable row level security;

revoke all on table public.post_sets, public.posting_jobs, public.post_attempts from anon, authenticated;
grant select on table public.post_sets, public.posting_jobs, public.post_attempts to authenticated;
grant all on table public.post_sets, public.posting_jobs, public.post_attempts to service_role;

create policy "admin can read post sets"
  on public.post_sets for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can read posting jobs"
  on public.posting_jobs for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can read post attempts"
  on public.post_attempts for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
