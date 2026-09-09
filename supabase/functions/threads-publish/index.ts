import { adminClient, decryptSecret, fetchJson, json, ProviderError, record, requiredString, requireAdmin, safeError } from '../_shared/http.ts';
import { withPrivateDb } from "../_shared/db.ts";

type PostItem = {
  id: string;
  kind: "parent" | "reply";
  text: string;
  status: "pending" | "container_created" | "published" | "failed" | "skipped";
  reply_to_id: string | null;
  container_id: string | null;
  post_id: string | null;
  attempt_count: number;
  last_error_code: string | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = record(await request.json());
    const service = await authorizedService(request);
    const postSetId = requiredString(body.post_set_id, "post_set_id");
    const forceRepost = body.force_repost === true;
    const gate = await readGate(service, postSetId);
    if (!gate.approval_status || gate.approval_status !== "approved") throw new ProviderError("APPROVAL_REQUIRED", "Manual approval is required before publishing.", 400);
    if (!gate.live_posting_enabled || gate.dry_run) throw new ProviderError("LIVE_POSTING_DISABLED", "Live posting is disabled. Turn off Dry Run and enable live posting first.", 400);
    if (gate.global_stop || gate.emergency_stop) throw new ProviderError("POSTING_STOPPED", "Posting is stopped by a safety control.", 400);
    if (gate.account_status !== "active") throw new ProviderError("ACCOUNT_NOT_ACTIVE", "The Threads account is not active.", 400);

    const token = await readThreadsToken();
    const itemsResult = await service.from("post_set_posts")
      .select("id, kind, text, status, reply_to_id, container_id, post_id, attempt_count, last_error_code")
      .eq("post_set_id", postSetId)
      .order("position", { ascending: true });
    if (itemsResult.error || !itemsResult.data || itemsResult.data.length === 0) throw new ProviderError("PAYLOAD_MISSING", "The post set has no post content.", 400);

    const items = itemsResult.data as PostItem[];
    if (forceRepost) {
      const reset = await service.from("post_set_posts").update({
        status: "pending",
        reply_to_id: null,
        container_id: null,
        post_id: null,
        last_error_code: null,
        last_error_message: null,
        published_at: null,
        updated_at: new Date().toISOString(),
      }).eq("post_set_id", postSetId);
      if (reset.error) throw new ProviderError("STORAGE_ERROR", "Could not prepare the post set for reposting.", 500);

      for (const item of items) {
        item.status = "pending";
        item.reply_to_id = null;
        item.container_id = null;
        item.post_id = null;
        item.last_error_code = null;
      }

      const queued = await service.from("post_sets").update({ status: "queued", updated_at: new Date().toISOString() }).eq("id", postSetId);
      if (queued.error) throw new ProviderError("STORAGE_ERROR", "Could not prepare the post set for reposting.", 500);
    }
    const parent = items.find((item) => item.kind === "parent");
    if (!parent) throw new ProviderError("PAYLOAD_MISSING", "The post set has no parent post.", 400);
    let published = items.filter((item) => item.status === "published").length;
    let failed = 0;
    let firstFailure: { code: string; message: string } | null = null;

    for (const item of items) {
      if (item.status === "published") continue;
      if (item.status === "failed" && item.last_error_code === "AMBIGUOUS_OUTCOME") {
        failed += 1;
        continue;
      }

      const attemptNo = Number(item.attempt_count || 0) + 1;
      let containerId = item.container_id;
      try {
        if (!containerId) {
          const replyToId = item.kind === "reply" ? item.reply_to_id || parent.post_id : null;
          if (item.kind === "reply" && !replyToId) throw new ProviderError("PARENT_NOT_PUBLISHED", "The parent post must be published before a reply.", 409);
          const container = await createContainer(token, item.text, replyToId);
          containerId = requiredString(record(container).id, "container_id");
          await service.from("post_set_posts").update({ status: "container_created", container_id: containerId, attempt_count: attemptNo, last_error_code: null, last_error_message: null, updated_at: new Date().toISOString() }).eq("id", item.id);
        }

        const publishedResponse = await publishContainer(token, containerId);
        const postId = requiredString(record(publishedResponse).id, "post_id");
        await service.from("post_set_posts").update({ status: "published", post_id: postId, published_at: new Date().toISOString(), attempt_count: attemptNo, last_error_code: null, last_error_message: null, updated_at: new Date().toISOString() }).eq("id", item.id);
        await recordAttempt(service, item.id, attemptNo, "succeeded", "publish", { post_id: postId });
        item.status = "published";
        item.post_id = postId;
        item.container_id = containerId;
        parent.post_id = parent.post_id || (item.kind === "parent" ? postId : parent.post_id);
        published += 1;
      } catch (error) {
        const safe = toPublishError(error);
        const status = safe.code === "AMBIGUOUS_OUTCOME" && containerId ? "container_created" : "failed";
        await service.from("post_set_posts").update({ status, attempt_count: attemptNo, last_error_code: safe.code, last_error_message: safe.message, updated_at: new Date().toISOString() }).eq("id", item.id);
        await recordAttempt(service, item.id, attemptNo, "failed", containerId ? "publish" : "create", { error: safe.code });
        firstFailure ??= { code: safe.code, message: safe.message };
        failed += 1;
        if (item.kind === "parent") break;
      }
    }

    const status = failed > 0 ? "partial_failure" : "succeeded";
    await service.from("post_sets").update({ status, updated_at: new Date().toISOString() }).eq("id", postSetId);
    return json({
      ok: failed === 0,
      status,
      post_set_id: postSetId,
      published,
      failed,
      ...(firstFailure ? {
        error: firstFailure.code,
        message: "[" + firstFailure.code + "] " + firstFailure.message,
      } : {}),
    });
  } catch (error) {
    const safe = safeError(error);
    return json({ ok: false, error: safe.code, message: safe.message }, safe.status);
  }
});

async function authorizedService(request: Request) {
  const expected = Deno.env.get('DISPATCHER_SECRET');
  const supplied = request.headers.get('x-dispatcher-secret');
  if (expected && supplied && expected === supplied) return adminClient();
  return (await requireAdmin(request)).service;
}

async function readGate(service: ReturnType<typeof adminClient>, postSetId: string) {
  const postSet = await service.from("post_sets").select("id, account_id, approval_status").eq("id", postSetId).maybeSingle();
  if (postSet.error || !postSet.data) throw new ProviderError("NOT_FOUND", "Post set was not found.", 404);
  const [account, settings] = await Promise.all([
    service.from("threads_accounts").select("status").eq("id", postSet.data.account_id).maybeSingle(),
    service.from("app_settings").select("live_posting_enabled, dry_run, global_stop, emergency_stop").eq("id", true).maybeSingle(),
  ]);
  if (account.error || settings.error) throw new ProviderError("STORAGE_ERROR", "Could not load publishing safety settings.", 500);
  return {
    approval_status: postSet.data.approval_status,
    account_status: account.data?.status,
    live_posting_enabled: settings.data?.live_posting_enabled === true,
    dry_run: settings.data?.dry_run !== false,
    global_stop: settings.data?.global_stop === true,
    emergency_stop: settings.data?.emergency_stop === true,
  };
}

async function readThreadsToken() {
  const row = await withPrivateDb(async (db) => {
    const result = await db.queryObject("select '\\x' || encode(ciphertext, 'hex') as ciphertext from private.integration_secrets where provider = 'threads'");
    return result.rows[0] as { ciphertext: string } | undefined;
  });
  if (!row) throw new ProviderError("NOT_CONNECTED", "Connect Threads before publishing.", 400);
  const secret = await decryptSecret(row.ciphertext);
  return requiredString(secret.access_token, "access_token");
}

async function createContainer(token: string, text: string, replyToId: string | null) {
  const url = new URL("https://graph.threads.net/me/threads");
  url.searchParams.set("media_type", "TEXT");
  url.searchParams.set("text", text);
  if (replyToId) url.searchParams.set("reply_to_id", replyToId);
  return fetchJson(url, { method: "POST", headers: { Authorization: "Bearer " + token } });
}

async function publishContainer(token: string, containerId: string) {
  const url = new URL("https://graph.threads.net/me/threads_publish");
  url.searchParams.set("creation_id", containerId);
  return fetchJson(url, { method: "POST", headers: { Authorization: "Bearer " + token } });
}

async function recordAttempt(service: ReturnType<typeof adminClient>, postSetPostId: string, attemptNo: number, status: string, operation: string, metadata: Record<string, unknown>) {
  const result = await service.from("post_attempts").insert({ post_set_post_id: postSetPostId, attempt_no: attemptNo, status, operation, response_metadata: metadata, finished_at: new Date().toISOString() });
  if (result.error) throw new ProviderError("STORAGE_ERROR", "Could not save the publishing attempt.", 500);
}

function toPublishError(error: unknown) {
  const safe = safeError(error);
  if (safe.code === "TIMEOUT" || safe.code === "NETWORK_ERROR") {
    return new ProviderError("AMBIGUOUS_OUTCOME", "The provider response was ambiguous. Review the post before retrying.", 409);
  }
  return safe;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
