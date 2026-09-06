import {
  adminClient,
  encryptSecret,
  fetchJson,
  ProviderError,
  record,
  requiredString,
  sha256,
} from "../_shared/http.ts";
import { withPrivateDb } from "../_shared/db.ts";

const htmlHeaders = { "Content-Type": "text/html; charset=utf-8" };

Deno.serve(async (request) => {
  if (request.method !== "GET") return new Response("Method Not Allowed", { status: 405 });

  try {
    const params = new URL(request.url).searchParams;
    const code = requiredString(params.get("code"), "code");
    const state = requiredString(params.get("state"), "state");
    const stateHash = await sha256(state);

    const validState = await withPrivateDb(async (db) => {
      const result = await db.queryObject(
        "select state_hash from private.oauth_states where state_hash = $1 and provider = 'threads' and used_at is null and expires_at > now() for update",
        stateHash,
      );
      if (result.rows.length !== 1) return false;

      await db.queryArray(
        "update private.oauth_states set used_at = now() where state_hash = $1",
        stateHash,
      );
      return true;
    });
    if (!validState) {
      throw new ProviderError("OAUTH_STATE_INVALID", "OAuth state is invalid or expired.", 400);
    }

    const appId = requiredString(Deno.env.get("THREADS_APP_ID"), "THREADS_APP_ID");
    const appSecret = requiredString(Deno.env.get("THREADS_APP_SECRET"), "THREADS_APP_SECRET");
    const redirectUri = requiredString(Deno.env.get("THREADS_REDIRECT_URI"), "THREADS_REDIRECT_URI");

    const exchange = new URL("https://graph.threads.net/oauth/access_token");
    exchange.searchParams.set("client_id", appId);
    exchange.searchParams.set("client_secret", appSecret);
    exchange.searchParams.set("code", code);
    exchange.searchParams.set("grant_type", "authorization_code");
    exchange.searchParams.set("redirect_uri", redirectUri);

    const shortToken = record(await fetchJson(exchange, { method: "POST" }));
    const shortAccessToken = requiredString(shortToken.access_token, "access_token");

    const longLived = new URL("https://graph.threads.net/access_token");
    longLived.searchParams.set("grant_type", "th_exchange_token");
    longLived.searchParams.set("client_secret", appSecret);
    longLived.searchParams.set("access_token", shortAccessToken);
    const longToken = record(await fetchJson(longLived));
    const accessToken = requiredString(longToken.access_token, "access_token");

    const profileUrl = new URL("https://graph.threads.net/me");
    profileUrl.searchParams.set("fields", "id,username,name");
    profileUrl.searchParams.set("access_token", accessToken);
    const profile = record(await fetchJson(profileUrl));
    const userId = requiredString(profile.id, "id");
    const expiresIn = typeof longToken.expires_in === "number"
      ? longToken.expires_in
      : 60 * 24 * 60 * 60;

    const encrypted = await encryptSecret({
      access_token: accessToken,
      token_type: longToken.token_type || "bearer",
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      threads_user_id: userId,
    });

    const service = adminClient();
    await withPrivateDb((db) => db.queryArray(
      "insert into private.integration_secrets (provider, ciphertext, key_version) values ('threads', decode($1, 'hex'), 1) on conflict (provider) do update set ciphertext = excluded.ciphertext, key_version = excluded.key_version, updated_at = now()",
      encrypted.slice(2),
    ));

    const { error } = await service.from("provider_connections").upsert({
      provider: "threads",
      status: "connected",
      display_name: (profile.name || profile.username || "Threads account") as string,
      external_account_id: userId,
      masked_identifier: typeof profile.username === "string" ? "@" + profile.username : "connected",
      last_checked_at: new Date().toISOString(),
      last_error_code: null,
      last_error_message: null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new ProviderError("STORAGE_ERROR", "Could not save the connection.", 500);

    return new Response(
      "<h1>Threads connection complete</h1><p>You can close this window and return to the dashboard.</p>",
      { headers: htmlHeaders },
    );
  } catch (error) {
    const safe = error instanceof ProviderError
      ? error
      : new ProviderError("INTERNAL_ERROR", "Threads connection failed.", 500);
    return new Response(
      "<h1>Threads connection failed</h1><p>" + safe.message + "</p>",
      { status: safe.status, headers: htmlHeaders },
    );
  }
});
