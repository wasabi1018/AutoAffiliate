import { adminClient, corsHeaders, json, ProviderError, record, requiredString, requireAdmin, safeError } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = record(await request.json());
    const { service, user } = await requireAdmin(request);
    const postSetId = requiredString(body.post_set_id, "post_set_id");
    const result = await service.from("post_sets")
      .update({ approval_status: "approved", approved_at: new Date().toISOString(), approved_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", postSetId)
      .eq("approval_status", "pending")
      .select("id, approval_status")
      .maybeSingle();
    if (result.error) throw new ProviderError("STORAGE_ERROR", "Could not approve the post set.", 500);
    if (!result.data) throw new ProviderError("APPROVAL_INVALID", "The post set is missing or is no longer pending approval.", 400);
    return json({ ok: true, post_set_id: result.data.id, approval_status: result.data.approval_status });
  } catch (error) {
    const safe = safeError(error);
    return json({ ok: false, error: safe.code, message: safe.message }, safe.status);
  }
});
