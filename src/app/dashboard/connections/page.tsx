import { createClient } from "@/lib/supabase/server";

import { ConnectionsPanel } from "@/app/dashboard/connections/panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "サービス連携" };

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
    <main className="dashboard-main connections-page">
      <div className="eyebrow">設定</div>
      <h1>サービス連携</h1>
      <p className="lede">Threadsと楽天を接続し、投稿と商品取得に使える状態か確認します。</p>
      {error ? <p className="error notice" role="alert">接続状態を読み込めませんでした。しばらくしてから再読み込みしてください。</p> : null}
      <ConnectionsPanel connections={(data || []) as Connection[]} />
    </main>
  );
}
