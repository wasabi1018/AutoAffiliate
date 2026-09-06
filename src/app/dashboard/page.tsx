import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/app/dashboard/sign-out-button";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  return (
    <div className="shell">
      <header className="container topbar">
        <span className="brand">Auto Affiliater</span>
        <div className="top-actions"><Link className="nav-link" href="/dashboard/settings">Settings</Link><SignOutButton /></div>
      </header>
      <main className="container main">
        <div className="eyebrow">Administrator dashboard</div>
        <h1>運用基盤の準備ができました。</h1>
        <p className="lede">現在はフェーズ1。投稿処理はまだ追加されておらず、Dry Run前提です。</p>
        <div className="dashboard-grid">
          <section className="card"><div className="muted">認証</div><div className="metric">接続済み</div><p className="muted">{data.user.email}</p></section>
          <section className="card"><div className="muted">投稿モード</div><div className="metric">Dry Run</div><p className="muted">本番投稿は無効</p></section>
          <section className="card"><div className="muted">次のフェーズ</div><div className="metric">設定UI</div><p className="muted">Threads・商品条件・テンプレート</p></section>
        </div>
      </main>
    </div>
  );
}
