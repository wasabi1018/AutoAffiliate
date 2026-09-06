import { adminClient, corsHeaders, json, ProviderError, randomState, record, requiredString, requireAdmin, safeError } from "../_shared/http.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = record(await request.json());
    const { service } = await requireAdmin(request);
    const accountId = requiredString(body.account_id, "account_id");
    if (!/^[0-9a-f-]{36}$/i.test(accountId)) throw new ProviderError("INVALID_INPUT", "account_id is invalid.", 400);
    const parentText = requiredText(body.parent_text, "parent_text");
    const replyText = body.reply_text === undefined || body.reply_text === null || body.reply_text === ""
      ? null
      : requiredText(body.reply_text, "reply_text");
    const strategy = optionalText(body.strategy, "strategy", 40);
    const hook = optionalText(body.hook, "hook", 160);
    const productId = optionalUuid(body.product_id, "product_id");
    const templateId = optionalUuid(body.template_id, "template_id");

    const account = await service.from("threads_accounts").select("id, status").eq("id", accountId).maybeSingle();
    if (account.error) throw new ProviderError("STORAGE_ERROR", "Could not load the Threads account.", 500);
    if (!account.data || account.data.status !== "active") throw new ProviderError("ACCOUNT_NOT_ACTIVE", "The Threads account is not active.", 400);

    const idempotencyKey = "manual:" + randomState();
    const postSet = await service.from("post_sets").insert({
      account_id: accountId,
      scheduled_for: new Date().toISOString(),
      status: "queued",
      idempotency_key: idempotencyKey,
      content_payload: { source: "manual_dashboard" },
      approval_status: "pending",
    }).select("id").single();
    if (postSet.error || !postSet.data) throw new ProviderError("STORAGE_ERROR", "Could not create the post set.", 500);

    const parent = await service.from("post_set_posts").insert({
      post_set_id: postSet.data.id,
      account_id: accountId,
      position: 0,
      kind: "parent",
      text: parentText,
      idempotency_key: postSet.data.id + ":parent",
      product_id: productId,
      strategy,
      hook,
      template_id: templateId,
    });
    if (parent.error) throw new ProviderError("STORAGE_ERROR", "Could not create the parent post.", 500);

    if (replyText) {
      const reply = await service.from("post_set_posts").insert({
        post_set_id: postSet.data.id,
        account_id: accountId,
        position: 1,
        kind: "reply",
        text: replyText,
        idempotency_key: postSet.data.id + ":reply:1",
        product_id: productId,
        strategy,
        template_id: templateId,
      });
      if (reply.error) throw new ProviderError("STORAGE_ERROR", "Could not create the reply post.", 500);
    }

    return json({ ok: true, post_set_id: postSet.data.id, approval_status: "pending" });
  } catch (error) {
    const safe = safeError(error);
    return json({ ok: false, error: safe.code, message: safe.message }, safe.status);
  }
});

function requiredText(value: unknown, name: string) {
  const text = requiredString(value, name);
  if (text.length > 500) throw new ProviderError("INVALID_INPUT", name + " must be 500 characters or fewer.", 400);
  return text;
}

function optionalText(value: unknown, name: string, maxLength: number) {
  if (value === undefined || value === null || value === "") return null;
  const text = requiredString(value, name);
  if (text.length > maxLength) throw new ProviderError("INVALID_INPUT", name + " must be " + maxLength + " characters or fewer.", 400);
  return text;
}

function optionalUuid(value: unknown, name: string) {
  const text = optionalText(value, name, 36);
  if (text === null) return null;
  if (!/^[0-9a-f-]{36}$/i.test(text)) throw new ProviderError("INVALID_INPUT", name + " is invalid.", 400);
  return text;
}
