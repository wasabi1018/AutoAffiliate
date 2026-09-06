import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "ホーム" };

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  const [accountsResult, connectionsResult, pendingResult, settingsResult] = await Promise.all([
    supabase.from("threads_accounts").select("id", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("provider_connections").select("provider, status"),
    supabase.from("post_sets").select("id", { count: "exact", head: true }).eq("approval_status", "pending"),
    supabase.from("app_settings").select("dry_run, auto_posting_enabled, global_stop, emergency_stop").eq("id", true).maybeSingle(),
  ]);

  const connectedCount = (connectionsResult.data || []).filter((connection) => connection.status === "connected").length;
  const settings = settingsResult.data || { dry_run: true, auto_posting_enabled: false, global_stop: false, emergency_stop: false };
  const stopped = settings.global_stop || settings.emergency_stop;

  return (
    <main className="dashboard-main">
      <div className="page-header">
        <div><div className="eyebrow">ホーム</div><h1>今日の運用状況</h1><p className="lede">確認が必要な項目と、次に行う操作をまとめています。</p></div>
        <span className={stopped ? "status-badge danger" : settings.dry_run ? "status-badge warning" : "status-badge success"}>
          {stopped ? "運用停止中" : settings.dry_run ? "テスト運用中" : settings.auto_posting_enabled ? "自動投稿中" : "手動投稿"}
        </span>
      </div>
      <section className="summary-grid" aria-label="運用サマリー">
        <Link className="summary-card" href="/dashboard/publishing"><span>承認待ちの投稿</span><strong>{pendingResult.count ?? 0}</strong><small>内容を確認する</small></Link>
        <Link className="summary-card" href="/dashboard/connections"><span>接続済みサービス</span><strong>{connectedCount}<small> / 2</small></strong><small>接続状態を確認する</small></Link>
        <Link className="summary-card" href="/dashboard/settings"><span>稼働アカウント</span><strong>{accountsResult.count ?? 0}</strong><small>アカウントを管理する</small></Link>
      </section>
      <section className="card quick-actions">
        <div className="section-heading"><div><div className="eyebrow">クイック操作</div><h2>次にできること</h2></div></div>
        <div className="action-list">
          <Link href="/dashboard/publishing"><strong>投稿を作成する</strong><span>投稿文を作り、内容を確認して承認します。</span></Link>
          <Link href="/dashboard/ranking"><strong>商品候補を探す</strong><span>楽天の商品を条件に合わせて評価します。</span></Link>
          <Link href="/dashboard/analytics"><strong>成果を確認する</strong><span>直近7日間の閲覧数や反応を振り返ります。</span></Link>
        </div>
      </section>
    </main>
  );
}
