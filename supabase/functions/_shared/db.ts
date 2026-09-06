import { Client } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

export async function withPrivateDb<T>(callback: (client: Client) => Promise<T>) {
  const connectionString = Deno.env.get("SUPABASE_DB_URL");
  if (!connectionString) throw new Error("SUPABASE_DB_URL is not configured.");
  const client = new Client(connectionString);
  await client.connect();
  try { return await callback(client); } finally { await client.end(); }
}