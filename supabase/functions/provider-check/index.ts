import {
  adminClient,
  decryptSecret,
  encryptSecret,
  fetchJson,
  json,
  ProviderError,
  record,
  requiredString,
  requireAdmin,
  safeError,
} from "../_shared/http.ts";
import { withPrivateDb } from "../_shared/db.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = record(await request.json());
    const provider = requiredString(body.provider, "provider");
    const { service } = await requireAdmin(request);

    if (provider === "threads") return json(await checkThreads(service));
    if (provider === "rakuten") return json(await checkRakuten(service, body));
    throw new ProviderError("INVALID_INPUT", "Unsupported provider.", 400);
  } catch (error) {
    const safe = safeError(error);
    return json({ ok: false, error: safe.code, message: safe.message }, safe.status);
  }
});

async function checkThreads(service: ReturnType<typeof adminClient>) {
  const row = await withPrivateDb(async (db) => {
    const result = await db.queryObject(
      "select '\\x' || encode(ciphertext, 'hex') as ciphertext from private.integration_secrets where provider = 'threads'",
    );
    return result.rows[0] as { ciphertext: string } | undefined;
  });
  if (!row) throw new ProviderError("NOT_CONNECTED", "Connect Threads before checking it.", 400);

  const secret = await decryptSecret(row.ciphertext);
  const accessToken = requiredString(secret.access_token, "access_token");

  const profileUrl = new URL("https://graph.threads.net/me");
  profileUrl.searchParams.set("fields", "id,username,name");
  profileUrl.searchParams.set("access_token", accessToken);
  const profile = record(await fetchJson(profileUrl));

  const limitUrl = new URL("https://graph.threads.net/me/threads_publishing_limit");
  limitUrl.searchParams.set("fields", "quota_usage,config,reply_quota_usage,reply_config");
  limitUrl.searchParams.set("access_token", accessToken);
  const usage = record(await fetchJson(limitUrl));

  const userId = requiredString(profile.id, "id");
  const { error } = await service.from("provider_connections").update({
    status: "connected",
    display_name: (profile.name || profile.username || "Threads account") as string,
    external_account_id: userId,
    masked_identifier: typeof profile.username === "string" ? "@" + profile.username : "connected",
    last_checked_at: new Date().toISOString(),
    last_error_code: null,
    last_error_message: null,
    updated_at: new Date().toISOString(),
  }).eq("provider", "threads");
  if (error) throw new ProviderError("STORAGE_ERROR", "Could not save the connection.", 500);

  return {
    ok: true,
    provider: "threads",
    display_name: profile.name || profile.username,
    username: profile.username,
    usage,
  };
}

async function checkRakuten(service: ReturnType<typeof adminClient>, body: Record<string, unknown>) {
  const applicationId = requiredString(body.application_id, "application_id");
  const accessKey = requiredString(body.access_key, "access_key");
  const affiliateId = typeof body.affiliate_id === "string" ? body.affiliate_id.trim() : "";

  const url = new URL("https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", applicationId);
  if (affiliateId) url.searchParams.set("affiliateId", affiliateId);

  const response = record(await fetchJson(url, { headers: {
    accessKey,
    Origin: "https://autoaffiliate-orcin.vercel.app",
    Referer: "https://autoaffiliate-orcin.vercel.app/",
  } }));
  if (!Array.isArray(response.items)) {
    throw new ProviderError("INVALID_RESPONSE", "Rakuten API returned an unexpected item list.");
  }

  const encrypted = await encryptSecret({
    application_id: applicationId,
    access_key: accessKey,
    affiliate_id: affiliateId || null,
  });
  await withPrivateDb((db) => db.queryArray(
    "insert into private.integration_secrets (provider, ciphertext, key_version) values ('rakuten', decode($1, 'hex'), 1) on conflict (provider) do update set ciphertext = excluded.ciphertext, key_version = excluded.key_version, updated_at = now()",
    encrypted.slice(2),
  ));

  const first = record(response.items[0]);
  const sampleName = typeof first.itemName === "string"
    ? first.itemName
    : typeof first.item === "object" && first.item
      ? (first.item as Record<string, unknown>).itemName
      : null;

  const { error } = await service.from("provider_connections").update({
    status: "connected",
    display_name: "Rakuten Ichiba",
    masked_identifier: applicationId.slice(0, 6) + "...",
    last_checked_at: new Date().toISOString(),
    last_error_code: null,
    last_error_message: null,
    updated_at: new Date().toISOString(),
  }).eq("provider", "rakuten");
  if (error) throw new ProviderError("STORAGE_ERROR", "Could not save the connection.", 500);

  return {
    ok: true,
    provider: "rakuten",
    item_count: response.items.length,
    sample_name: sampleName || null,
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
