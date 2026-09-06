-- Phase 6 Threads publishing state, manual approval, and partial-failure tracking.

alter table public.app_settings
  add column if not exists live_posting_enabled boolean not null default false;

alter table public.post_sets
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('pending', 'approved', 'rejected')),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users (id);

create table if not exists public.post_set_posts (
  id uuid primary key default gen_random_uuid(),
  post_set_id uuid not null references public.post_sets (id) on delete cascade,
  account_id uuid not null references public.threads_accounts (id) on delete cascade,
  position smallint not null check (position >= 0),
  kind text not null check (kind in ('parent', 'reply')),
  text text not null check (char_length(trim(text)) between 1 and 500),
  reply_to_id text,
  status text not null default 'pending'
    check (status in ('pending', 'container_created', 'published', 'failed', 'skipped')),
  idempotency_key text not null unique,
  container_id text,
  post_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_error_code text,
  last_error_message text check (last_error_message is null or char_length(last_error_message) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (post_set_id, position)
);

create index if not exists post_set_posts_processing_idx
  on public.post_set_posts (post_set_id, position);

alter table public.post_attempts
  alter column posting_job_id drop not null,
  add column if not exists post_set_post_id uuid references public.post_set_posts (id) on delete cascade,
  add column if not exists operation text;

alter table public.post_attempts
  add constraint post_attempts_target_check
  check (posting_job_id is not null or post_set_post_id is not null);

create unique index if not exists post_attempts_post_set_post_operation_idx
  on public.post_attempts (post_set_post_id, attempt_no, operation)
  where post_set_post_id is not null;

alter table public.post_set_posts enable row level security;

revoke all on table public.post_set_posts from anon, authenticated;
grant select on table public.post_set_posts to authenticated;
grant all on table public.post_set_posts to service_role;

create policy "admin can read post set posts"
  on public.post_set_posts for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
