import { corsHeaders, json, ProviderError, requireAdmin, safeError } from "../_shared/http.ts";
import { withPrivateDb } from "../_shared/db.ts";

type Job = {
  id: string;
  post_set_id: string;
  account_id: string;
  attempt_count: number;
  max_attempts: number;
};

type DispatchResult = {
  enqueued: number;
  claimed: number;
  dry_run: number;
  skipped: number;
  retried: number;
  dead_letter: number;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await authorize(request);
    const result = await withPrivateDb(async (db) => {
      await db.queryArray("delete from public.post_attempts where retention_expires_at < now()");
      const enqueued = await enqueueDueSchedules(db);
      const jobs = await claimJobs(db, 20);
      const counters = { dry_run: 0, skipped: 0, retried: 0, dead_letter: 0 };

      for (const job of jobs) {
        try {
          const outcome = await processJob(db, job);
          if (outcome === "dry_run") counters.dry_run += 1;
          if (outcome === "skipped") counters.skipped += 1;
        } catch (error) {
          const safe = safeError(error);
          const outcome = await failJob(db, job, safe.code, safe.message);
          if (outcome === "queued") counters.retried += 1;
          if (outcome === "dead_letter") counters.dead_letter += 1;
        }
      }

      await syncPostSetStatuses(db);
      return { enqueued, claimed: jobs.length, ...counters } satisfies DispatchResult;
    });
    return json({ ok: true, mode: "dry_run", ...result });
  } catch (error) {
    const safe = safeError(error);
    return json({ ok: false, error: safe.code, message: safe.message }, safe.status);
  }
});

async function authorize(request: Request) {
  const expected = Deno.env.get("DISPATCHER_SECRET");
  const supplied = request.headers.get("x-dispatcher-secret");
  if (expected && supplied && expected === supplied) return;
  await requireAdmin(request);
}

async function enqueueDueSchedules(db: any) {
  const schedules = await db.queryObject<{ account_id: string; slot_key: string; scheduled_for: string }>(`
    select
      s.account_id,
      to_char(now() at time zone s.timezone, 'YYYY-MM-DD') || ':' || s.weekdays[i] || ':' || s.posting_times[i]::text as slot_key,
      now() as scheduled_for
    from public.posting_schedules s
    join public.threads_accounts a on a.id = s.account_id
    cross join lateral generate_subscripts(s.weekdays, 1) as indexes(i)
    where s.enabled
      and a.status = 'active'
      and s.weekdays[i] = extract(dow from now() at time zone s.timezone)::smallint
      and s.posting_times[i] <= (now() at time zone s.timezone)::time
      and s.posting_times[i] > ((now() at time zone s.timezone)::time - interval '1 minute')
  `);

  let enqueued = 0;
  for (const schedule of schedules.rows) {
    const idempotencyKey = schedule.account_id + ":" + schedule.slot_key;
    const setResult = await db.queryObject<{ id: string }>(
      "insert into public.post_sets (account_id, scheduled_for, status, idempotency_key, content_payload) values ($1, $2, 'queued', $3, $4::jsonb) on conflict (idempotency_key) do nothing returning id",
      schedule.account_id,
      schedule.scheduled_for,
      idempotencyKey,
      JSON.stringify({ source: "posting_schedule", dry_run: true }),
    );
    if (setResult.rows.length === 0) continue;

    await db.queryArray(
      "insert into public.posting_jobs (post_set_id, account_id, job_key, scheduled_for, payload) values ($1, $2, $3, $4, $5::jsonb) on conflict (job_key) do nothing",
      setResult.rows[0].id,
      schedule.account_id,
      idempotencyKey + ":job",
      schedule.scheduled_for,
      JSON.stringify({ source: "posting_schedule", dry_run: true }),
    );
    enqueued += 1;
  }
  return enqueued;
}

async function claimJobs(db: any, limit: number): Promise<Job[]> {
  await db.queryArray("begin");
  try {
    const result = await db.queryObject<Job>(
      "select id, post_set_id, account_id, attempt_count, max_attempts from public.posting_jobs where status = 'queued' and next_attempt_at <= now() and scheduled_for <= now() order by scheduled_for asc, created_at asc for update skip locked limit $1",
      limit,
    );
    for (const job of result.rows) {
      await db.queryArray(
        "update public.posting_jobs set status = 'running', locked_at = now(), started_at = coalesce(started_at, now()), updated_at = now() where id = $1",
        job.id,
      );
    }
    await db.queryArray("commit");
    return result.rows;
  } catch (error) {
    await db.queryArray("rollback");
    throw error;
  }
}

async function processJob(db: any, job: Job): Promise<"dry_run" | "skipped"> {
  const accountResult = await db.queryObject<{
    status: string;
    daily_post_limit: number;
    min_post_interval_minutes: number;
    dry_run: boolean;
    auto_posting_enabled: boolean;
    global_stop: boolean;
    emergency_stop: boolean;
  }>(
    "select a.status, a.daily_post_limit, a.min_post_interval_minutes, coalesce(s.dry_run, true) as dry_run, coalesce(s.auto_posting_enabled, false) as auto_posting_enabled, coalesce(s.global_stop, false) as global_stop, coalesce(s.emergency_stop, false) as emergency_stop from public.threads_accounts a left join public.app_settings s on s.id = true where a.id = $1",
    job.account_id,
  );
  const account = accountResult.rows[0];
  if (!account) throw new ProviderError("ACCOUNT_NOT_FOUND", "The scheduled account no longer exists.", 400);

  if (account.status !== "active") return skipJob(db, job, "ACCOUNT_NOT_ACTIVE");
  if (account.global_stop || account.emergency_stop) return skipJob(db, job, "POSTING_STOPPED");
  if (!account.dry_run) return skipJob(db, job, "LIVE_POSTING_NOT_IMPLEMENTED");

  const dailyCount = await db.queryObject<{ count: number }>(
    "select count(*)::int as count from public.posting_jobs where account_id = $1 and status in ('dry_run', 'succeeded') and finished_at >= date_trunc('day', now())",
    job.account_id,
  );
  if (Number(dailyCount.rows[0]?.count || 0) >= account.daily_post_limit) {
    await db.queryArray(
      "update public.posting_jobs set status = 'queued', next_attempt_at = date_trunc('day', now()) + interval '1 day', locked_at = null, updated_at = now(), last_error_code = 'DAILY_LIMIT' where id = $1",
      job.id,
    );
    return "skipped";
  }

  const latest = await db.queryObject<{ finished_at: string }>(
    "select finished_at from public.posting_jobs where account_id = $1 and status in ('dry_run', 'succeeded') and finished_at is not null and finished_at + make_interval(mins => $2) > now() order by finished_at desc limit 1",
    job.account_id,
  );
  if (latest.rows[0]?.finished_at) {
    await db.queryArray(
      "update public.posting_jobs set status = 'queued', next_attempt_at = greatest(now(), $2::timestamptz + make_interval(mins => $3)), locked_at = null, updated_at = now(), last_error_code = 'MIN_INTERVAL' where id = $1",
      job.id,
      latest.rows[0].finished_at,
      account.min_post_interval_minutes,
    );
    return "skipped";
  }

  const attemptNo = job.attempt_count + 1;
  await db.queryArray(
    "insert into public.post_attempts (posting_job_id, attempt_no, status, response_metadata, finished_at) values ($1, $2, 'dry_run', $3::jsonb, now())",
    job.id,
    attemptNo,
    JSON.stringify({ mode: "dry_run", publishing: false }),
  );
  await db.queryArray(
    "update public.posting_jobs set status = 'dry_run', attempt_count = $2, finished_at = now(), locked_at = null, updated_at = now(), last_error_code = null, last_error_message = null where id = $1",
    job.id,
    attemptNo,
  );
  return "dry_run";
}

async function skipJob(db: any, job: Job, code: string): Promise<"skipped"> {
  const attemptNo = job.attempt_count + 1;
  await db.queryArray(
    "insert into public.post_attempts (posting_job_id, attempt_no, status, error_code, error_message, response_metadata, finished_at) values ($1, $2, 'skipped', $3, $4, $5::jsonb, now())",
    job.id,
    attemptNo,
    code,
    "Job was skipped by a safety rule.",
    JSON.stringify({ mode: "dry_run", publishing: false }),
  );
  await db.queryArray(
    "update public.posting_jobs set status = 'cancelled', attempt_count = $2, finished_at = now(), locked_at = null, updated_at = now(), last_error_code = $3, last_error_message = $4 where id = $1",
    job.id,
    attemptNo,
    code,
    "Job was skipped by a safety rule.",
  );
  return "skipped";
}

async function failJob(db: any, job: Job, code: string, message: string) {
  const attemptNo = job.attempt_count + 1;
  const final = attemptNo >= job.max_attempts;
  const status = final ? "dead_letter" : "queued";
  const delay = Math.min(3600, 60 * 2 ** Math.max(0, attemptNo - 1));
  await db.queryArray(
    "insert into public.post_attempts (posting_job_id, attempt_no, status, error_code, error_message, finished_at) values ($1, $2, 'failed', $3, $4, now())",
    job.id,
    attemptNo,
    code,
    message.slice(0, 500),
  );
  await db.queryArray(
    "update public.posting_jobs set status = $2, attempt_count = $3, next_attempt_at = case when $2 = 'queued' then now() + make_interval(secs => $4) else next_attempt_at end, finished_at = case when $2 = 'dead_letter' then now() else null end, locked_at = null, updated_at = now(), last_error_code = $5, last_error_message = $6 where id = $1",
    job.id,
    status,
    attemptNo,
    delay,
    code,
    message.slice(0, 500),
  );
  return status;
}

async function syncPostSetStatuses(db: any) {
  await db.queryArray(`
    update public.post_sets set
      status = case
        when exists (select 1 from public.posting_jobs j where j.post_set_id = post_sets.id and j.status = 'running') then 'running'
        when exists (select 1 from public.posting_jobs j where j.post_set_id = post_sets.id and j.status = 'queued') then 'queued'
        when exists (select 1 from public.posting_jobs j where j.post_set_id = post_sets.id and j.status = 'dead_letter') then 'dead_letter'
        when exists (select 1 from public.posting_jobs j where j.post_set_id = post_sets.id and j.status = 'failed') then 'partial_failure'
        when exists (select 1 from public.posting_jobs j where j.post_set_id = post_sets.id and j.status = 'cancelled') then 'cancelled'
        when exists (select 1 from public.posting_jobs j where j.post_set_id = post_sets.id and j.status = 'dry_run') then 'dry_run'
        else 'succeeded'
      end,
      updated_at = now()
    where id in (select distinct post_set_id from public.posting_jobs where updated_at >= now() - interval '2 minutes')
  `);
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-dispatcher-secret",
};
