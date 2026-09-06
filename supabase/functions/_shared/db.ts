import { Pool, PoolClient } from "jsr:@db/postgres@0.19.5";
import { ProviderError } from "./http.ts";

let pool: Pool | null = null;

function privatePool() {
  const connectionString = Deno.env.get("SUPABASE_DB_URL");
  if (!connectionString) {
    throw new ProviderError("PRIVATE_DB_CONFIG_MISSING", "Private credential storage is not configured.", 500);
  }
  pool ??= new Pool(connectionString, 1, true);
  return pool;
}

export async function withPrivateDb<T>(callback: (client: PoolClient) => Promise<T>) {
  let client: PoolClient;
  try {
    client = await privatePool().connect();
  } catch (error) {
    console.error("private-db connection failed", safeDatabaseDiagnostic(error));
    throw new ProviderError("PRIVATE_DB_CONNECTION_FAILED", "Could not connect to private credential storage.", 500);
  }

  try {
    return await callback(client);
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    console.error("private-db query failed", safeDatabaseDiagnostic(error));
    throw new ProviderError("PRIVATE_DB_QUERY_FAILED", "Could not update private credential storage.", 500);
  } finally {
    client.release();
  }
}

function safeDatabaseDiagnostic(error: unknown) {
  if (!error || typeof error !== "object") return { name: "UnknownError" };
  const value = error as Record<string, unknown>;
  const fields = value.fields && typeof value.fields === "object"
    ? value.fields as Record<string, unknown>
    : null;
  return {
    name: typeof value.name === "string" ? value.name.slice(0, 80) : "Error",
    code: typeof value.code === "string"
      ? value.code.slice(0, 20)
      : fields && typeof fields.code === "string" ? fields.code.slice(0, 20) : undefined,
    severity: fields && typeof fields.severity === "string" ? fields.severity.slice(0, 20) : undefined,
  };
}
