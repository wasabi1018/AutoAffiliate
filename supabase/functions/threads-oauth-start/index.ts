import { corsHeaders, json, ProviderError, randomState, requireAdmin, sha256 } from "../_shared/http.ts";
import { withPrivateDb } from "../_shared/db.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    await requireAdmin(request);
    const appId = Deno.env.get("THREADS_APP_ID");
    const redirectUri = Deno.env.get("THREADS_REDIRECT_URI");
    if (!appId || !redirectUri) {
      throw new ProviderError("CONFIG_MISSING", "Threads OAuth configuration is incomplete.", 500);
    }

    const state = randomState();
    await withPrivateDb(async (db) => db.queryArray(
      "insert into private.oauth_states (state_hash, provider, expires_at) values ($1, 'threads', now() + interval '10 minutes')",
      [await sha256(state)],
    ));

    const url = new URL("https://threads.net/oauth/authorize");
    url.searchParams.set("client_id", appId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", Deno.env.get("THREADS_SCOPES") || "threads_basic");
    url.searchParams.set("response_type", "code");
    url.searchParams.set("state", state);

    return json({ authorize_url: url.toString() });
  } catch (error) {
    const safe = error instanceof ProviderError
      ? error
      : new ProviderError("INTERNAL_ERROR", "OAuth initialization failed.", 500);
    return json({ error: safe.code, message: safe.message }, safe.status);
  }
});
