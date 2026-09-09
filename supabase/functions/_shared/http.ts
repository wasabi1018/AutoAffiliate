import { createClient } from "https://esm.sh/@supabase/supabase-js@2.115.0";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export class ProviderError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 502) {
    super(message);
  }
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new ProviderError("CONFIG_MISSING", "Supabase function configuration is incomplete.", 500);
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function requireAdmin(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  if (!authHeader || !anonKey || !url) throw new ProviderError("UNAUTHORIZED", "Please sign in.", 401);

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) throw new ProviderError("UNAUTHORIZED", "Please sign in.", 401);

  const { data: admin } = await userClient
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!admin) throw new ProviderError("FORBIDDEN", "Administrator access is required.", 403);

  return { service: adminClient(), user };
}

export async function fetchJson(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new ProviderError("INVALID_RESPONSE", "The provider returned an invalid response.");
    }

    if (!response.ok) {
      const code = classifyHttpStatus(response.status);
      const status = response.status === 401 || response.status === 403 || response.status === 429
        ? response.status
        : response.status >= 500 ? 502 : 400;
      throw new ProviderError(code, providerFailureMessage(response.status, body), status);
    }
    return body;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ProviderError("TIMEOUT", "The provider request timed out.", 504);
    }
    throw new ProviderError("NETWORK_ERROR", "The provider request could not be completed.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

function classifyHttpStatus(status: number) {
  if (status === 401 || status === 403) return "AUTH_ERROR";
  if (status === 404) return "NOT_FOUND";
  if (status === 429) return "RATE_LIMITED";
  return status >= 500 ? "UPSTREAM_ERROR" : "BAD_REQUEST";
}

function providerFailureMessage(status: number, body: unknown) {
  const rakutenMessage = rakutenErrorMessage(body);
  if (rakutenMessage) return `Rakuten API rejected the request: ${rakutenMessage}`;
  const providerMessage = genericProviderErrorMessage(body);
  if (providerMessage) return providerMessage;
  if (status === 401 || status === 403) return "The provider rejected the credentials.";
  if (status === 429) return "The provider rate limit was exceeded. Try again later.";
  if (status >= 500) return "The provider is temporarily unavailable. Try again later.";
  return "The provider rejected the request. Check the credentials and input values.";
}

function genericProviderErrorMessage(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const error = (body as Record<string, unknown>).error;
  if (!error || typeof error !== "object" || Array.isArray(error)) return null;
  const value = error as Record<string, unknown>;
  const rawMessage = typeof value.message === "string" ? value.message : "";
  const message = rawMessage.replace(/[\r\n\t]+/g, " ").trim().slice(0, 240);
  if (!message || /https?:\/\/|access[_ -]?token|bearer\s|token=/i.test(message)) return null;
  const code = typeof value.code === "number" || typeof value.code === "string"
    ? String(value.code).replace(/[^0-9A-Za-z_.-]/g, "").slice(0, 32)
    : "";
  return code ? `The provider rejected the request (code ${code}): ${message}` : `The provider rejected the request: ${message}`;
}

function rakutenErrorMessage(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const errors = (body as Record<string, unknown>).errors;
  if (!errors || typeof errors !== "object" || Array.isArray(errors)) return null;
  const message = (errors as Record<string, unknown>).errorMessage;
  const sanitized = typeof message === "string" ? message.replace(/[\r\n\t]+/g, " ").trim().slice(0, 160) : "";
  return sanitized && !/https?:\/\/|accesskey|token=/i.test(sanitized) ? sanitized : null;
}

export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderError("INVALID_RESPONSE", "The provider returned an invalid response.");
  }
  return value as Record<string, unknown>;
}

export function requiredString(value: unknown, name: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderError("INVALID_INPUT", name + " is required.", 400);
  }
  return value.trim();
}

export function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secretKey() {
  const encoded = Deno.env.get("INTEGRATION_SECRET_KEY");
  if (!encoded) throw new ProviderError("CONFIG_MISSING", "Integration secret encryption is not configured.", 500);

  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  } catch {
    throw new ProviderError("CONFIG_MISSING", "Integration secret encryption is not configured.", 500);
  }
  if (bytes.length !== 32) throw new ProviderError("CONFIG_MISSING", "Integration secret encryption is not configured.", 500);
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await secretKey(),
    new TextEncoder().encode(JSON.stringify(value)),
  ));
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv);
  combined.set(encrypted, iv.length);
  return "\\x" + [...combined].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function decryptSecret(ciphertext: unknown) {
  if (typeof ciphertext !== "string" || !ciphertext.startsWith("\\x")) {
    throw new ProviderError("SECRET_INVALID", "Stored integration secret is invalid.", 500);
  }
  const hex = ciphertext.slice(2);
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new ProviderError("SECRET_INVALID", "Stored integration secret is invalid.", 500);
  }
  const bytes = Uint8Array.from(hex.match(/.{1,2}/g) || [], (pair) => Number.parseInt(pair, 16));
  if (bytes.length <= 12) throw new ProviderError("SECRET_INVALID", "Stored integration secret is invalid.", 500);

  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      await secretKey(),
      bytes.slice(12),
    );
    return JSON.parse(new TextDecoder().decode(decrypted)) as Record<string, unknown>;
  } catch {
    throw new ProviderError("SECRET_INVALID", "Stored integration secret is invalid.", 500);
  }
}

export function safeError(error: unknown) {
  if (error instanceof ProviderError) return error;
  return new ProviderError("INTERNAL_ERROR", "The provider check failed.", 500);
}
