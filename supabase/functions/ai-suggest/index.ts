import { generateText, gateway, Output } from "npm:ai@7.0.93";
import { z } from "npm:zod@4.1.12";

import { adminClient, corsHeaders, json, ProviderError, requireAdmin, safeError } from "../_shared/http.ts";

type Service = ReturnType<typeof adminClient>;
type StrategyWeights = { ranking_weight: number; sale_weight: number; trending_weight: number };
type Schedule = { weekdays: number[]; posting_times: string[]; timezone: string; enabled: boolean } | null;
type Summary = {
  scope: "selected_account" | "all_accounts";
  period_start: string;
  period_end: string;
  published_posts: number;
  measured_posts: number;
  strategy_weights: StrategyWeights;
  strategy_breakdown: Array<{ strategy: string; posts: number; views: number; engagement: number; engagement_rate: number | null }>;
  hour_breakdown: Array<{ hour_utc: number; posts: number; views: number; engagement: number }>;
  hook_breakdown: Array<{ hook_present: boolean; posts: number; views: number; engagement: number }>;
  schedule: Schedule;
  template_options: Array<{ key: string; template_type: "hook"; active: boolean }>;
};
type Context = { summary: Summary; accountId: string | null; preferredTemplateId: string | null; templateIds: Map<string, string>; schedule: Schedule };
type SuggestionRow = { id: string; analysis_id: string; kind: string; title: string; recommendation: string; rationale: string; target: unknown; before_value: unknown; proposed_value: unknown; confidence: number | null; status: string };

const suggestionSchema = z.object({
  suggestions: z.array(z.object({
    kind: z.enum(["strategy_weight", "posting_time", "template"]),
    target_key: z.enum(["strategy_weights", "posting_schedule", "preferred_hook_template"]),
    title: z.string().min(1).max(120),
    recommendation: z.string().min(1).max(500),
    rationale: z.string().min(1).max(1000),
    proposed_value: z.object({
      ranking_weight: z.number().optional(),
      sale_weight: z.number().optional(),
      trending_weight: z.number().optional(),
      posting_times: z.array(z.string()).optional(),
      template_key: z.string().optional(),
    }),
    confidence: z.number().min(0).max(1),
  })).max(5),
});

type ModelSuggestion = z.infer<typeof suggestionSchema>["suggestions"][number];

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let runId: string | null = null;
  try {
    const body = asRecord(await request.json());
    const { service, user } = await requireAdmin(request);
    const action = body.action === undefined ? "generate" : requiredChoice(body.action, "action", ["generate", "approve", "reject", "apply"] as const);

    if (action === "generate") {
      const result = await generateSuggestions(service, user.id, body);
      runId = result.run_id;
      return json(result);
    }

    const suggestionId = requiredUuid(body.suggestion_id, "suggestion_id");
    return json(await reviewSuggestion(service, user.id, suggestionId, action));
  } catch (error) {
    const safe = safeError(error);
    return json({ ok: false, error: safe.code, message: safe.message }, safe.status);
  }
});

async function generateSuggestions(service: Service, userId: string, body: Record<string, unknown>) {
  const accountId = optionalUuid(body.account_id, "account_id");
  await assertActiveAccount(service, accountId);
  const periodDays = positiveInt(body.period_days, "period_days", 30, 1, 90);
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd.getTime() - periodDays * 24 * 60 * 60 * 1000);
  const model = Deno.env.get("AI_SUGGEST_MODEL") || "openai/gpt-5.4-mini";
  const runId = crypto.randomUUID();
  const context = await buildContext(service, accountId, periodStart, periodEnd);

  const created = await service.from("ai_analysis_runs").insert({
    id: runId,
    requested_account_id: accountId,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    period_days: periodDays,
    input_summary: context.summary,
    model,
    status: "running",
    created_by: userId,
  });
  if (created.error) throw new ProviderError("STORAGE_ERROR", "Could not create the AI analysis run.", 500);

  try {
    if (context.summary.published_posts < 3 || context.summary.measured_posts < 3) {
      const reason = context.summary.published_posts < 3
        ? "At least three published posts are required before generating a suggestion."
        : "At least three posts with official insight metrics are required before generating a suggestion.";
      await finishRun(service, runId, { status: "insufficient_data", error_message: reason });
      return { ok: true, run_id: runId, status: "insufficient_data", suggestions: [], message: reason };
    }

    if (!Deno.env.get("AI_GATEWAY_API_KEY")) {
      await finishRun(service, runId, { status: "failed", error_message: "AI Gateway is not configured." });
      throw new ProviderError("CONFIG_MISSING", "AI Gateway is not configured.", 500);
    }

    const prompt = buildPrompt(context.summary);
    const result = await generateText({
      model: gateway(model as never),
      system: "You are a conservative operations analyst. Use only the aggregate data in the user prompt. Never request or infer personal data, credentials, code, database permissions, or emergency-stop changes. Return only bounded, reversible recommendations for human review. Write user-facing fields in Japanese.",
      prompt,
      output: Output.object({ schema: suggestionSchema }),
      maxOutputTokens: 1600,
    });
    const output = result.output;
    if (!output) throw new ProviderError("INVALID_RESPONSE", "The AI provider returned no structured suggestions.");

    const suggestions = output.suggestions
      .map((suggestion) => normalizeSuggestion(suggestion, context))
      .filter((suggestion): suggestion is Record<string, unknown> => suggestion !== null)
      .slice(0, 3);
    if (suggestions.length > 0) {
      const inserted = await service.from("ai_suggestions").insert(suggestions.map((suggestion) => ({ ...suggestion, analysis_id: runId })));
      if (inserted.error) throw new ProviderError("STORAGE_ERROR", "Could not save AI suggestions.", 500);
    }

    const inputTokens = nonnegativeInt(result.usage.inputTokens) || estimateTokens(JSON.stringify(context.summary));
    const outputTokens = nonnegativeInt(result.usage.outputTokens) || estimateTokens(JSON.stringify(output));
    const estimatedCost = estimateCost(inputTokens, outputTokens);
    await finishRun(service, runId, {
      status: "succeeded",
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      estimated_cost_usd: estimatedCost,
    });
    return { ok: true, run_id: runId, status: "succeeded", suggestion_count: suggestions.length };
  } catch (error) {
    await finishRun(service, runId, { status: "failed", error_message: safeError(error).message });
    throw error;
  }
}

async function buildContext(service: Service, accountId: string | null, periodStart: Date, periodEnd: Date): Promise<Context> {
  const postsQuery = service.from("post_set_posts")
    .select("id, account_id, strategy, hook, published_at")
    .eq("status", "published")
    .not("published_at", "is", null)
    .gte("published_at", periodStart.toISOString())
    .lte("published_at", periodEnd.toISOString())
    .limit(500);
  const postsResult = accountId ? await postsQuery.eq("account_id", accountId) : await postsQuery;
  if (postsResult.error) throw new ProviderError("STORAGE_ERROR", "Could not load aggregate post data.", 500);
  const posts = postsResult.data || [];
  const postIds = posts.map((post) => post.id);
  const snapshotsResult = postIds.length === 0
    ? { data: [], error: null }
    : await service.from("post_insight_snapshots")
      .select("post_set_post_id, window_label, metrics_status, views, likes, replies, reposts, quotes, shares, captured_at")
      .in("post_set_post_id", postIds)
      .order("captured_at", { ascending: false })
      .limit(1000);
  if (snapshotsResult.error) throw new ProviderError("STORAGE_ERROR", "Could not load aggregate insight data.", 500);

  const postMap = new Map(posts.map((post) => [post.id, post]));
  const measured = new Map<string, Record<string, unknown>>();
  for (const snapshot of snapshotsResult.data || []) {
    if (measured.has(snapshot.post_set_post_id)) continue;
    if (snapshot.metrics_status !== "available" && snapshot.metrics_status !== "partial") continue;
    measured.set(snapshot.post_set_post_id, snapshot as Record<string, unknown>);
  }

  const strategyGroups = new Map<string, Group>();
  const hourGroups = new Map<number, Group>();
  const hookGroups = new Map<boolean, Group>();
  for (const [postId, snapshot] of measured) {
    const post = postMap.get(postId);
    if (!post) continue;
    const group = metrics(snapshot);
    addGroup(strategyGroups, typeof post.strategy === "string" && post.strategy ? post.strategy : "UNSET", group);
    addGroup(hourGroups, new Date(post.published_at).getUTCHours(), group);
    addGroup(hookGroups, typeof post.hook === "string" && post.hook.trim().length > 0, group);
  }

  const weights = await readWeights(service, accountId);
  const schedule = await readSchedule(service, accountId);
  const templateResult = await service.from("post_templates").select("id, template_type, active").eq("template_type", "hook").eq("active", true).order("created_at", { ascending: true }).limit(20);
  if (templateResult.error) throw new ProviderError("STORAGE_ERROR", "Could not load template options.", 500);
  const templateIds = new Map<string, string>();
  const templateOptions = (templateResult.data || []).map((template, index) => {
    const key = "template_" + (index + 1);
    templateIds.set(key, template.id);
    return { key, template_type: "hook" as const, active: Boolean(template.active) };
  });
  let preferredTemplateId: string | null = null;
  if (accountId) {
    const accountResult = await service.from("threads_accounts").select("preferred_hook_template_id").eq("id", accountId).maybeSingle();
    if (accountResult.error) throw new ProviderError("STORAGE_ERROR", "Could not load account template preference.", 500);
    preferredTemplateId = accountResult.data?.preferred_hook_template_id || null;
  }

  const summary: Summary = {
    scope: accountId ? "selected_account" : "all_accounts",
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    published_posts: posts.length,
    measured_posts: measured.size,
    strategy_weights: weights,
    strategy_breakdown: [...strategyGroups.entries()].map(([strategy, group]) => ({ strategy, ...finishGroup(group) })).sort(sortGroup),
    hour_breakdown: [...hourGroups.entries()].map(([hour_utc, group]) => ({ hour_utc, ...finishGroup(group) })).sort(sortGroup),
    hook_breakdown: [...hookGroups.entries()].map(([hook_present, group]) => ({ hook_present, ...finishGroup(group) })).sort(sortGroup),
    schedule,
    template_options: templateOptions,
  };
  return { summary, accountId, preferredTemplateId, templateIds, schedule };
}

type Group = { posts: number; views: number; views_known_posts: number; engagement: number; engagement_known_values: number };
function knownMetric(snapshot: Record<string, unknown>, key: string) {
  const value = snapshot[key];
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null;
}
function metrics(snapshot: Record<string, unknown>): Group {
  const viewValue = knownMetric(snapshot, "views");
  const engagementValues = ["likes", "replies", "reposts", "quotes", "shares"].map((key) => knownMetric(snapshot, key)).filter((value): value is number => value !== null);
  return {
    posts: 1,
    views: viewValue ?? 0,
    views_known_posts: viewValue === null ? 0 : 1,
    engagement: engagementValues.reduce((total, value) => total + value, 0),
    engagement_known_values: engagementValues.length,
  };
}
function addGroup<K>(groups: Map<K, Group>, key: K, value: Group) {
  const current = groups.get(key) || { posts: 0, views: 0, views_known_posts: 0, engagement: 0, engagement_known_values: 0 };
  groups.set(key, { posts: current.posts + value.posts, views: current.views + value.views, views_known_posts: current.views_known_posts + value.views_known_posts, engagement: current.engagement + value.engagement, engagement_known_values: current.engagement_known_values + value.engagement_known_values });
}
function finishGroup(group: Group) {
  return { posts: group.posts, views: group.views, views_known_posts: group.views_known_posts, engagement: group.engagement, engagement_known_values: group.engagement_known_values, engagement_rate: group.views > 0 && group.engagement_known_values === group.posts * 5 ? Number((group.engagement / group.views * 100).toFixed(2)) : null };
}
function sortGroup(left: { posts: number; views: number; engagement: number }, right: { posts: number; views: number; engagement: number }) {
  return right.engagement - left.engagement || right.views - left.views || right.posts - left.posts;
}

async function readWeights(service: Service, accountId: string | null): Promise<StrategyWeights> {
  const globalResult = await service.from("strategy_settings").select("ranking_weight, sale_weight, trending_weight").eq("id", true).maybeSingle();
  if (globalResult.error) throw new ProviderError("STORAGE_ERROR", "Could not load strategy weights.", 500);
  if (accountId) {
    const accountResult = await service.from("account_strategy_settings").select("ranking_weight, sale_weight, trending_weight").eq("account_id", accountId).maybeSingle();
    if (accountResult.error) throw new ProviderError("STORAGE_ERROR", "Could not load account strategy weights.", 500);
    if (accountResult.data) return toWeights(accountResult.data);
  }
  return toWeights(globalResult.data || { ranking_weight: 60, sale_weight: 20, trending_weight: 20 });
}
function toWeights(value: Record<string, unknown>): StrategyWeights {
  return { ranking_weight: Number(value.ranking_weight), sale_weight: Number(value.sale_weight), trending_weight: Number(value.trending_weight) };
}
async function readSchedule(service: Service, accountId: string | null): Promise<Schedule> {
  if (!accountId) return null;
  const result = await service.from("posting_schedules").select("weekdays, posting_times, timezone, enabled").eq("account_id", accountId).maybeSingle();
  if (result.error) throw new ProviderError("STORAGE_ERROR", "Could not load posting schedule.", 500);
  if (!result.data) return null;
  return { weekdays: result.data.weekdays || [], posting_times: result.data.posting_times || [], timezone: result.data.timezone, enabled: Boolean(result.data.enabled) };
}

function buildPrompt(summary: Summary) {
  return [
    "Analyze the following aggregate performance summary and return conservative suggestions.",
    "Only use evidence in this summary. Do not invent metrics or facts.",
    "Allowed target_key values:",
    "- strategy_weights: proposed_value must contain ranking_weight, sale_weight, trending_weight; total must equal 100.",
    "- posting_schedule: proposed_value must contain posting_times as HH:MM strings; only suggest if a selected account has an existing schedule.",
    "- preferred_hook_template: proposed_value must contain template_key from template_options; only suggest for a selected account.",
    "Do not return more than three suggestions. Skip weak or unsupported ideas.",
    JSON.stringify(summary),
  ].join("\n");
}

function normalizeSuggestion(raw: ModelSuggestion, context: Context): Record<string, unknown> | null {
  const targetKey = raw.target_key;
  if ((raw.kind === "strategy_weight" && targetKey !== "strategy_weights") || (raw.kind === "posting_time" && targetKey !== "posting_schedule") || (raw.kind === "template" && targetKey !== "preferred_hook_template")) return null;
  const target = { target_key: targetKey, account_id: context.accountId };
  if (raw.kind === "strategy_weight") {
    const proposed = parseWeights(raw.proposed_value);
    if (!proposed || maxWeightDelta(context.summary.strategy_weights, proposed) > 20 || sameWeights(context.summary.strategy_weights, proposed)) return null;
    return suggestionRecord(raw, target, context.summary.strategy_weights, proposed);
  }
  if (!context.accountId) return null;
  if (raw.kind === "posting_time") {
    if (!context.schedule) return null;
    const proposedTimes = parseTimes(raw.proposed_value.posting_times);
    if (!proposedTimes || sameStringArray(context.schedule.posting_times, proposedTimes)) return null;
    return suggestionRecord(raw, target, context.schedule, { posting_times: proposedTimes });
  }
  const templateKey = typeof raw.proposed_value.template_key === "string" ? raw.proposed_value.template_key : null;
  const templateId = templateKey ? context.templateIds.get(templateKey) : null;
  if (!templateKey || !templateId || templateId === context.preferredTemplateId) return null;
  return suggestionRecord(raw, target, { preferred_hook_template_id: context.preferredTemplateId }, { preferred_hook_template_id: templateId, template_key: templateKey });
}
function suggestionRecord(raw: ModelSuggestion, target: Record<string, unknown>, before: unknown, proposed: unknown) {
  return { kind: raw.kind, title: raw.title.trim(), recommendation: raw.recommendation.trim(), rationale: raw.rationale.trim(), target, before_value: before, proposed_value: proposed, confidence: Number(raw.confidence.toFixed(3)), status: "pending" };
}
function parseWeights(value: Record<string, unknown>): StrategyWeights | null {
  const weights = { ranking_weight: Number(value.ranking_weight), sale_weight: Number(value.sale_weight), trending_weight: Number(value.trending_weight) };
  if (Object.values(weights).some((weight) => !Number.isFinite(weight) || weight < 0 || weight > 100)) return null;
  if (Math.abs(weights.ranking_weight + weights.sale_weight + weights.trending_weight - 100) > 0.01) return null;
  return weights;
}
function maxWeightDelta(before: StrategyWeights, proposed: StrategyWeights) {
  return Math.max(Math.abs(before.ranking_weight - proposed.ranking_weight), Math.abs(before.sale_weight - proposed.sale_weight), Math.abs(before.trending_weight - proposed.trending_weight));
}
function sameWeights(left: StrategyWeights, right: StrategyWeights) { return left.ranking_weight === right.ranking_weight && left.sale_weight === right.sale_weight && left.trending_weight === right.trending_weight; }
function parseTimes(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) return null;
  const times = value.filter((time): time is string => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time));
  return times.length === value.length && new Set(times).size === times.length ? times : null;
}
function sameStringArray(left: string[], right: string[]) { return left.length === right.length && left.every((value, index) => value === right[index]); }

async function reviewSuggestion(service: Service, userId: string, suggestionId: string, action: "approve" | "reject" | "apply") {
  const result = await service.from("ai_suggestions").select("id, analysis_id, kind, title, recommendation, rationale, target, before_value, proposed_value, confidence, status").eq("id", suggestionId).maybeSingle();
  if (result.error) throw new ProviderError("STORAGE_ERROR", "Could not load the AI suggestion.", 500);
  if (!result.data) throw new ProviderError("NOT_FOUND", "AI suggestion was not found.", 404);
  const suggestion = result.data as SuggestionRow;
  if (action === "apply") {
    if (suggestion.status !== "approved") throw new ProviderError("INVALID_STATE", "Approve the suggestion before applying it.", 409);
    await applySuggestion(service, suggestion);
    const applied = await service.from("ai_suggestions").update({ status: "applied", applied_by: userId, applied_at: new Date().toISOString() }).eq("id", suggestionId).eq("status", "approved").select("id, status").maybeSingle();
    if (applied.error || !applied.data) throw new ProviderError("CONFLICT", "The suggestion changed before it was applied.", 409);
    return { ok: true, suggestion_id: suggestionId, status: "applied" };
  }
  const status = action === "approve" ? "approved" : "rejected";
  const updated = await service.from("ai_suggestions").update({ status, reviewed_by: userId, reviewed_at: new Date().toISOString() }).eq("id", suggestionId).eq("status", "pending").select("id, status").maybeSingle();
  if (updated.error || !updated.data) throw new ProviderError("CONFLICT", "The suggestion is no longer pending.", 409);
  return { ok: true, suggestion_id: suggestionId, status };
}

async function applySuggestion(service: Service, suggestion: SuggestionRow) {
  const target = asRecord(suggestion.target);
  const accountId = target.account_id ? requiredUuid(target.account_id, "target.account_id") : null;
  if (suggestion.kind === "strategy_weight") {
    const before = parseWeights(asRecord(suggestion.before_value));
    const proposed = parseWeights(asRecord(suggestion.proposed_value));
    if (!before || !proposed || maxWeightDelta(before, proposed) > 20) throw new ProviderError("INVALID_SUGGESTION", "The strategy change is outside the allowed range.", 400);
    const current = await readWeights(service, accountId);
    if (!sameWeights(current, before)) throw new ProviderError("CONFLICT", "Strategy weights changed after this suggestion was created.", 409);
    if (accountId) {
      const update = await service.from("account_strategy_settings").upsert({ account_id: accountId, ...proposed, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
      if (update.error) throw new ProviderError("STORAGE_ERROR", "Could not apply account strategy weights.", 500);
    } else {
      const update = await service.from("strategy_settings").update({ ...proposed, updated_at: new Date().toISOString() }).eq("id", true);
      if (update.error) throw new ProviderError("STORAGE_ERROR", "Could not apply global strategy weights.", 500);
    }
    return;
  }
  if (!accountId) throw new ProviderError("INVALID_SUGGESTION", "Account scope is required for this suggestion.", 400);
  if (suggestion.kind === "posting_time") {
    const before = asRecord(suggestion.before_value);
    const proposed = asRecord(suggestion.proposed_value);
    const beforeTimes = parseTimes(before.posting_times);
    const proposedTimes = parseTimes(proposed.posting_times);
    if (!beforeTimes || !proposedTimes) throw new ProviderError("INVALID_SUGGESTION", "The posting time change is invalid.", 400);
    const current = await readSchedule(service, accountId);
    if (!current || !sameStringArray(current.posting_times, beforeTimes)) throw new ProviderError("CONFLICT", "The posting schedule changed after this suggestion was created.", 409);
    const update = await service.from("posting_schedules").update({ posting_times: proposedTimes, updated_at: new Date().toISOString() }).eq("account_id", accountId);
    if (update.error) throw new ProviderError("STORAGE_ERROR", "Could not apply posting times.", 500);
    return;
  }
  const proposed = asRecord(suggestion.proposed_value);
  const templateId = requiredUuid(proposed.preferred_hook_template_id, "preferred_hook_template_id");
  const template = await service.from("post_templates").select("id").eq("id", templateId).eq("template_type", "hook").eq("active", true).maybeSingle();
  if (template.error) throw new ProviderError("STORAGE_ERROR", "Could not validate the hook template.", 500);
  if (!template.data) throw new ProviderError("INVALID_SUGGESTION", "The suggested template is not active.", 400);
  const before = asRecord(suggestion.before_value);
  const account = await service.from("threads_accounts").select("preferred_hook_template_id").eq("id", accountId).maybeSingle();
  if (account.error) throw new ProviderError("STORAGE_ERROR", "Could not load template preference.", 500);
  if ((account.data?.preferred_hook_template_id || null) !== (before.preferred_hook_template_id || null)) throw new ProviderError("CONFLICT", "The template preference changed after this suggestion was created.", 409);
  const update = await service.from("threads_accounts").update({ preferred_hook_template_id: templateId, updated_at: new Date().toISOString() }).eq("id", accountId);
  if (update.error) throw new ProviderError("STORAGE_ERROR", "Could not apply the template preference.", 500);
}

async function finishRun(service: Service, runId: string, values: Record<string, unknown>) {
  await service.from("ai_analysis_runs").update({ ...values, completed_at: new Date().toISOString() }).eq("id", runId);
}
function estimateTokens(value: string) { return Math.max(1, Math.ceil(value.length / 4)); }
function estimateCost(inputTokens: number, outputTokens: number) {
  const inputRate = envNumber("AI_INPUT_COST_PER_1M_USD", 0.75);
  const outputRate = envNumber("AI_OUTPUT_COST_PER_1M_USD", 4.5);
  return Number(((inputTokens / 1_000_000) * inputRate + (outputTokens / 1_000_000) * outputRate).toFixed(8));
}
function envNumber(name: string, fallback: number) { const value = Number(Deno.env.get(name)); return Number.isFinite(value) && value >= 0 ? value : fallback; }
function nonnegativeInt(value: unknown) { const parsed = typeof value === "number" ? value : Number(value); return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0; }
function asRecord(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProviderError("INVALID_INPUT", "Object input is required.", 400); return value as Record<string, unknown>; }
function requiredChoice<T extends string>(value: unknown, name: string, choices: readonly T[]): T { if (typeof value !== "string" || !choices.includes(value as T)) throw new ProviderError("INVALID_INPUT", name + " is invalid.", 400); return value as T; }
function requiredUuid(value: unknown, name: string) { if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new ProviderError("INVALID_INPUT", name + " is invalid.", 400); return value; }
function optionalUuid(value: unknown, name: string) { if (value === undefined || value === null || value === "") return null; return requiredUuid(value, name); }
function positiveInt(value: unknown, name: string, fallback: number, min: number, max: number) { if (value === undefined || value === null || value === "") return fallback; const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new ProviderError("INVALID_INPUT", name + " is invalid.", 400); return parsed; }
async function assertActiveAccount(service: Service, accountId: string | null) { if (!accountId) return; const result = await service.from("threads_accounts").select("id, status").eq("id", accountId).maybeSingle(); if (result.error) throw new ProviderError("STORAGE_ERROR", "Could not load the strategy account.", 500); if (!result.data || result.data.status !== "active") throw new ProviderError("ACCOUNT_NOT_ACTIVE", "The strategy account is not active.", 400); }