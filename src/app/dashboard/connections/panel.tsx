"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Connection = {
  provider: "threads" | "rakuten";
  status: "disconnected" | "connected" | "error" | "needs_reconnect";
  display_name: string | null;
  masked_identifier: string | null;
  last_checked_at: string | null;
  last_error_code: string | null;
};

function statusLabel(status: Connection["status"]) {
  return { connected: "Connected", disconnected: "Not connected", error: "Error", needs_reconnect: "Reconnect required" }[status];
}

export function ConnectionsPanel({ connections }: { connections: Connection[] }) {
  const byProvider = new Map(connections.map((connection) => [connection.provider, connection]));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [rakuten, setRakuten] = useState({ application_id: "", access_key: "", affiliate_id: "" });

  async function startThreads() {
    setBusy("threads");
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("threads-oauth-start", { body: {} });
    if (error || !data?.authorize_url) setMessage("Threads OAuth could not start. Check Edge Function deployment and Secrets.");
    else window.location.assign(data.authorize_url);
    setBusy(null);
  }

  async function checkThreads() {
    setBusy("threads");
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("provider-check", { body: { provider: "threads" } });
    setMessage(error || !data?.ok ? (data?.message || "Threads connection check failed.") : `Threads connection verified: ${data.username || data.display_name || "account"}`);
    setBusy(null);
  }

  async function checkRakuten(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("rakuten");
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("provider-check", { body: { provider: "rakuten", ...rakuten } });
    setMessage(error || !data?.ok ? (data?.message || "Rakuten connection check failed.") : `Rakuten connection verified: ${data.item_count} item(s) received.`);
    setBusy(null);
  }

  const threads = byProvider.get("threads");
  const rakutenConnection = byProvider.get("rakuten");
  return (
    <div className="connection-grid">
      <section className="card connection-card">
        <div className="eyebrow">Threads</div>
        <h2>Threads connection</h2>
        <ConnectionStatus connection={threads} />
        <p className="muted">OAuth tokens are encrypted and stored by an Edge Function. No publishing is performed in Phase 3.</p>
        <div className="form-row">
          <button className="button" disabled={busy !== null} onClick={startThreads} type="button">{busy === "threads" ? "Connecting..." : "Connect with OAuth"}</button>
          <button className="button secondary" disabled={busy !== null || !threads || threads.status !== "connected"} onClick={checkThreads} type="button">Check connection</button>
        </div>
      </section>
      <section className="card connection-card">
        <div className="eyebrow">Rakuten Web Service</div>
        <h2>Rakuten API connection</h2>
        <ConnectionStatus connection={rakutenConnection} />
        <p className="muted">Credentials are sent to the Edge Function over HTTPS and never rendered back to the browser.</p>
        <form className="settings-form" onSubmit={checkRakuten}>
          <div className="field"><label htmlFor="connection-application-id">Application ID</label><input id="connection-application-id" required value={rakuten.application_id} onChange={(event) => setRakuten({ ...rakuten, application_id: event.target.value })} /></div>
          <div className="field"><label htmlFor="connection-access-key">Access Key</label><input id="connection-access-key" required type="password" value={rakuten.access_key} onChange={(event) => setRakuten({ ...rakuten, access_key: event.target.value })} /></div>
          <div className="field"><label htmlFor="connection-affiliate-id">Affiliate ID (optional)</label><input id="connection-affiliate-id" value={rakuten.affiliate_id} onChange={(event) => setRakuten({ ...rakuten, affiliate_id: event.target.value })} /></div>
          <button className="button" disabled={busy !== null} type="submit">{busy === "rakuten" ? "Checking..." : "Check and save"}</button>
        </form>
      </section>
      {message ? <p className="connection-message" role="status">{message}</p> : null}
    </div>
  );
}

function ConnectionStatus({ connection }: { connection?: Connection }) {
  return (
    <div className="connection-status">
      <strong>{statusLabel(connection?.status || "disconnected")}</strong>
      {connection?.masked_identifier ? <span className="muted">{connection.masked_identifier}</span> : null}
      {connection?.last_checked_at ? <span className="muted">Last checked: {new Date(connection.last_checked_at).toLocaleString("en-US")}</span> : null}
    </div>
  );
}