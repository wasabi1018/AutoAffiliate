-- Phase 9 AI suggestions: aggregate-only inputs, human review, and bounded application.

alter table public.threads_accounts
  add column if not exists preferred_hook_template_id uuid references public.post_templates (id) on delete set null;

create table if not exists public.ai_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  requested_account_id uuid references public.threads_accounts (id) on delete set null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  period_days smallint not null check (period_days between 1 and 90),
  input_summary jsonb not null default '{}'::jsonb,
  model text,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'insufficient_data', 'failed')),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_usd numeric(12,8) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  error_message text check (error_message is null or char_length(error_message) <= 500),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (period_end > period_start)
);

create index if not exists ai_analysis_runs_created_idx
  on public.ai_analysis_runs (created_at desc);

create index if not exists ai_analysis_runs_account_created_idx
  on public.ai_analysis_runs (requested_account_id, created_at desc);

create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.ai_analysis_runs (id) on delete cascade,
  kind text not null check (kind in ('strategy_weight', 'posting_time', 'template')),
  title text not null check (char_length(trim(title)) between 1 and 120),
  recommendation text not null check (char_length(trim(recommendation)) between 1 and 500),
  rationale text not null check (char_length(trim(rationale)) between 1 and 1000),
  target jsonb not null default '{}'::jsonb,
  before_value jsonb not null default '{}'::jsonb,
  proposed_value jsonb not null default '{}'::jsonb,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'applied')),
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  applied_by uuid references auth.users (id),
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ai_suggestions_status_created_idx
  on public.ai_suggestions (status, created_at desc);

create index if not exists ai_suggestions_analysis_idx
  on public.ai_suggestions (analysis_id, created_at asc);

alter table public.ai_analysis_runs enable row level security;
alter table public.ai_suggestions enable row level security;

revoke all on table public.ai_analysis_runs, public.ai_suggestions from anon, authenticated;
grant select on table public.ai_analysis_runs, public.ai_suggestions to authenticated;
grant all on table public.ai_analysis_runs, public.ai_suggestions to service_role;

create policy "admin can read ai analysis runs"
  on public.ai_analysis_runs for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));

create policy "admin can read ai suggestions"
  on public.ai_suggestions for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = (select auth.uid())));
