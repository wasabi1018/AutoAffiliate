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
  return { connected: "接続済み", disconnected: "未接続", error: "接続エラー", needs_reconnect: "再接続が必要" }[status];
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
    if (error || !data?.authorize_url) setMessage("Threadsとの接続を開始できませんでした。設定を確認してください。");
    else window.location.assign(data.authorize_url);
    setBusy(null);
  }

  async function checkThreads() {
    setBusy("threads");
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("provider-check", { body: { provider: "threads" } });
    setMessage(error || !data?.ok ? (data?.message || "Threadsの接続確認に失敗しました。") : `Threadsの接続を確認しました：${data.username || data.display_name || "アカウント"}`);
    if (error && !data?.message) {
      const detail = await functionErrorMessage(error);
      if (detail) setMessage(detail);
    }
    setBusy(null);
  }

  async function checkRakuten(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("rakuten");
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("provider-check", { body: { provider: "rakuten", ...rakuten } });
    setMessage(error || !data?.ok ? (data?.message || "楽天の接続確認に失敗しました。") : `楽天の接続を確認しました：${data.item_count}件の商品を取得しました。`);
    if (error && !data?.message) {
      const detail = await functionErrorMessage(error);
      if (detail) setMessage(detail);
    }
    setBusy(null);
  }

  const threads = byProvider.get("threads");
  const rakutenConnection = byProvider.get("rakuten");
  return (
    <div className="connection-grid">
      <section className="card connection-card">
        <div className="eyebrow">Threads</div>
        <h2>Threads</h2>
        <ConnectionStatus connection={threads} />
        <p className="muted">Threadsアカウントを接続し、投稿に利用できるか確認します。</p>
        <div className="form-row">
          <button className="button" disabled={busy !== null} onClick={startThreads} type="button">{busy === "threads" ? "接続中…" : "Threadsと接続"}</button>
          <button className="button secondary" disabled={busy !== null || !threads || threads.status !== "connected"} onClick={checkThreads} type="button">接続を確認</button>
        </div>
      </section>
      <section className="card connection-card">
        <div className="eyebrow">楽天</div>
        <h2>楽天ウェブサービス</h2>
        <ConnectionStatus connection={rakutenConnection} />
        <p className="muted">楽天の商品情報を取得するための認証情報を入力します。</p>
        <form className="settings-form" onSubmit={checkRakuten}>
          <div className="field"><label htmlFor="connection-application-id">アプリケーションID</label><input id="connection-application-id" required value={rakuten.application_id} onChange={(event) => setRakuten({ ...rakuten, application_id: event.target.value })} /></div>
          <div className="field"><label htmlFor="connection-access-key">アクセスキー</label><input id="connection-access-key" required type="password" value={rakuten.access_key} onChange={(event) => setRakuten({ ...rakuten, access_key: event.target.value })} /></div>
          <div className="field"><label htmlFor="connection-affiliate-id">アフィリエイトID（任意）</label><input id="connection-affiliate-id" value={rakuten.affiliate_id} onChange={(event) => setRakuten({ ...rakuten, affiliate_id: event.target.value })} /></div>
          <button className="button" disabled={busy !== null} type="submit">{busy === "rakuten" ? "確認中…" : "確認して保存"}</button>
        </form>
      </section>
      {message ? <p className="connection-message" role="status">{message}</p> : null}
    </div>
  );
}

async function functionErrorMessage(error: unknown) {
  const context = error && typeof error === "object" && "context" in error
    ? (error as { context?: unknown }).context
    : null;
  if (!(context instanceof Response)) return null;

  try {
    const body = await context.clone().json() as { message?: unknown };
    return typeof body.message === "string" && body.message.trim() ? body.message : null;
  } catch {
    return null;
  }
}

function ConnectionStatus({ connection }: { connection?: Connection }) {
  return (
    <div className="connection-status">
      <strong>{statusLabel(connection?.status || "disconnected")}</strong>
      {connection?.masked_identifier ? <span className="muted">{connection.masked_identifier}</span> : null}
      {connection?.last_checked_at ? <span className="muted">最終確認：{new Date(connection.last_checked_at).toLocaleString("ja-JP")}</span> : null}
    </div>
  );
}
