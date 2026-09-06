import {
  adminClient,
  decryptSecret,
  fetchJson,
  json,
  ProviderError,
  record,
  requiredString,
  requireAdmin,
  safeError,
} from "../_shared/http.ts";
import { withPrivateDb } from "../_shared/db.ts";

const WINDOWS = [
  { label: "1h", interval: "1 hour" },
  { label: "6h", interval: "6 hours" },
  { label: "24h", interval: "24 hours" },
  { label: "72h", interval: "72 hours" },
] as const;

type Job = {
  id: string;
  post_set_post_id: string;
  account_id: string;
  post_id: string;
  window_label: (typeof WINDOWS)[number]["label"];
  attempt_count: number;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await authorize(request);
    const service = adminClient();
    const result = await collect(service);
    return json({ ok: true, ...result });
  } catch (error) {
    const safe = safeError(error);
    return json({ ok: false, error: safe.code, message: safe.message }, safe.status);
  }
});

async function authorize(request: Request) {
  const expected = Deno.env.get("INSIGHTS_CRON_SECRET");
  const supplied = request.headers.get("x-insights-secret");
  if (expected && supplied && expected === supplied) return;
  await requireAdmin(request);
}

async function collect(service: ReturnType<typeof adminClient>) {
  const enqueued = await enqueueJobs(service);
  const jobs = await claimJobs(service, 20);
  const counters = { succeeded: 0, failed: 0, retried: 0, dead_letter: 0 };

  for (const job of jobs) {
    try {
      await processJob(service, job);
      counters.succeeded += 1;
    } catch (error) {
      const safe = safeError(error);
      const final = await failJob(service, job, safe.code, safe.message);
      counters.failed += 1;
      if (final === "queued") counters.retried += 1;
      if (final === "dead_letter") counters.dead_letter += 1;
    }
  }

  return { enqueued, claimed: jobs.length, ...counters };
}

async function enqueueJobs(service: ReturnType<typeof adminClient>) {
  const posts = await service.from("post_set_posts")
    .select("id, post_id, account_id, published_at")
    .eq("status", "published")
    .not("post_id", "is", null)
    .not("published_at", "is", null)
    .limit(100);
  if (posts.error) throw new ProviderError("STORAGE_ERROR", "Could not load published posts.", 500);

  let count = 0;
  for (const post of posts.data || []) {
    for (const window of WINDOWS) {
      const scheduledFor = new Date(post.published_at).getTime() + parseIntervalMs(window.interval);
      const result = await service.from("post_insight_jobs").insert({
        post_set_post_id: post.id,
        account_id: post.account_id,
        post_id: post.post_id,
        window_label: window.label,
        scheduled_for: new Date(scheduledFor).toISOString(),
      });
      if (!result.error) count += 1;
      if (result.error && result.error.code !== "23505") {
        throw new ProviderError("STORAGE_ERROR", "Could not enqueue an insights job.", 500);
      }
    }
  }
  return count;
}

async function claimJobs(service: ReturnType<typeof adminClient>, limit: number) {
  const result = await service.from("post_insight_jobs")
    .select("id, post_set_post_id, account_id, post_id, window_label, attempt_count")
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .lte("next_attempt_at", new Date().toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(limit);
  if (result.error) throw new ProviderError("STORAGE_ERROR", "Could not load insights jobs.", 500);

  const jobs: Job[] = [];
  for (const row of result.data || []) {
    const update = await service.from("post_insight_jobs")
      .update({ status: "running", locked_at: new Date().toISOString(), started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .eq("status", "queued")
      .select("id, post_set_post_id, account_id, post_id, window_label, attempt_count")
      .maybeSingle();
    if (!update.error && update.data) jobs.push(update.data as Job);
  }
  return jobs;
}

async function processJob(service: ReturnType<typeof adminClient>, job: Job) {
  const token = await readThreadsToken();
  const url = new URL(`https://graph.threads.net/${encodeURIComponent(job.post_id)}/insights`);
  url.searchParams.set("metric", "views,likes,replies,reposts,quotes,shares");
  const payload = await fetchJson(url, { headers: { Authorization: "Bearer " + token } });
  const normalized = normalizeInsights(payload);

  const snapshot = await service.from("post_insight_snapshots").upsert({
    insight_job_id: job.id,
    post_set_post_id: job.post_set_post_id,
    account_id: job.account_id,
    post_id: job.post_id,
    window_label: job.window_label,
    captured_at: new Date().toISOString(),
    metrics_status: normalized.metrics_status,
    metric_names: normalized.metric_names,
    views: normalized.views,
    likes: normalized.likes,
    replies: normalized.replies,
    reposts: normalized.reposts,
    quotes: normalized.quotes,
    shares: normalized.shares,
    clicks: null,
    ctr: null,
  }, { onConflict: "insight_job_id" });
  if (snapshot.error) throw new ProviderError("STORAGE_ERROR", "Could not save an insights snapshot.", 500);

  const updated = await service.from("post_insight_jobs").update({
    status: "succeeded",
    attempt_count: Number(job.attempt_count || 0) + 1,
    finished_at: new Date().toISOString(),
    locked_at: null,
    last_error_code: null,
    last_error_message: null,
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);
  if (updated.error) throw new ProviderError("STORAGE_ERROR", "Could not complete the insights job.", 500);
}

async function failJob(service: ReturnType<typeof adminClient>, job: Job, code: string, message: string) {
  const attemptNo = Number(job.attempt_count || 0) + 1;
  const final = attemptNo >= 3;
  const status = final ? "dead_letter" : "queued";
  const delaySeconds = Math.min(3600, 60 * 2 ** Math.max(0, attemptNo - 1));
  await service.from("post_insight_jobs").update({
    status,
    attempt_count: attemptNo,
    next_attempt_at: final ? new Date().toISOString() : new Date(Date.now() + delaySeconds * 1000).toISOString(),
    finished_at: final ? new Date().toISOString() : null,
    locked_at: null,
    last_error_code: code,
    last_error_message: message.slice(0, 500),
    updated_at: new Date().toISOString(),
  }).eq("id", job.id);
  return status;
}

async function readThreadsToken() {
  const row = await withPrivateDb(async (db) => {
    const result = await db.queryObject("select '\\x' || encode(ciphertext, 'hex') as ciphertext from private.integration_secrets where provider = 'threads'");
    return result.rows[0] as { ciphertext: string } | undefined;
  });
  if (!row) throw new ProviderError("NOT_CONNECTED", "Connect Threads before collecting insights.", 400);
  const secret = await decryptSecret(row.ciphertext);
  return requiredString(secret.access_token, "access_token");
}

function normalizeInsights(value: unknown) {
  const root = record(value);
  const metrics = Array.isArray(root.data) ? root.data.map(record) : [];
  const values: Record<string, number> = {};
  const names: string[] = [];
  for (const metric of metrics) {
    if (typeof metric.name !== "string") continue;
    const rawValues = Array.isArray(metric.values) ? metric.values : [metric];
    const rawValue = rawValues.at(-1);
    const candidate = rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)
      ? (rawValue as Record<string, unknown>).value
      : undefined;
    const parsed = typeof candidate === "number" ? candidate : Number(candidate);
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    values[metric.name] = Math.trunc(parsed);
    names.push(metric.name);
  }
  const requested = ["views", "likes", "replies", "reposts", "quotes", "shares"] as const;
  return {
    metrics_status: names.length === 0 ? "unavailable" : names.length === requested.length ? "available" : "partial",
    metric_names: [...new Set(names)],
    views: values.views ?? null,
    likes: values.likes ?? null,
    replies: values.replies ?? null,
    reposts: values.reposts ?? null,
    quotes: values.quotes ?? null,
    shares: values.shares ?? null,
  };
}

function parseIntervalMs(value: string) {
  const match = value.match(/^(\d+) (hour|hours)$/);
  if (!match) throw new ProviderError("CONFIG_MISSING", "Invalid insights window configuration.", 500);
  return Number(match[1]) * 60 * 60 * 1000;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-insights-secret",
};
