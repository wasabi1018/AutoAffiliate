import { createClient } from "@/lib/supabase/server";

import { ConnectionsPanel } from "@/app/dashboard/connections/panel";

export const dynamic = "force-dynamic";

type Connection = {
  provider: "threads" | "rakuten";
  status: "disconnected" | "connected" | "error" | "needs_reconnect";
  display_name: string | null;
  masked_identifier: string | null;
  last_checked_at: string | null;
  last_error_code: string | null;
};

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("provider_connections")
    .select("provider, status, display_name, masked_identifier, last_checked_at, last_error_code");

  return (
    <main className="container main connections-page">
      <div className="eyebrow">Phase 3 - Providers</div>
      <h1>External service connections</h1>
      <p className="lede">This page only verifies connections. Threads publishing is not implemented or executed in Phase 3.</p>
      {error ? <p className="error" role="alert">Connection status could not be loaded. Apply the Phase 3 migration and reload.</p> : null}
      <ConnectionsPanel connections={(data || []) as Connection[]} />
    </main>
  );
}