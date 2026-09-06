import Link from "next/link";
import { redirect } from "next/navigation";

import { SignOutButton } from "@/app/dashboard/sign-out-button";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");

  return (
    <div className="shell">
      <header className="container topbar">
        <span className="brand">Auto Affiliater</span>
        <div className="top-actions">
          <Link className="nav-link" href="/dashboard/settings">Settings</Link>
          <Link className="nav-link" href="/dashboard/connections">Connections</Link>
          <Link className="nav-link" href="/dashboard/jobs">Jobs</Link>
          <Link className="nav-link" href="/dashboard/publishing">Publishing</Link>
          <Link className="nav-link" href="/dashboard/analytics">Analytics</Link>
          <Link className="nav-link" href="/dashboard/ranking">Ranking</Link>
          <Link className="nav-link" href="/dashboard/suggestions">AI Suggest</Link>
          <SignOutButton />
        </div>
      </header>
      <main className="container main">
        <div className="eyebrow">Administrator dashboard</div>
        <h1>Affiliate operations, ready for safe setup.</h1>
        <p className="lede">Phase 9 adds aggregate-only AI suggestions with a human approval gate. Publishing and configuration changes remain controlled.</p>
        <div className="dashboard-grid">
          <section className="card">
            <div className="muted">Authentication</div>
            <div className="metric">Signed in</div>
            <p className="muted">{data.user.email}</p>
          </section>
          <section className="card">
            <div className="muted">Execution mode</div>
            <div className="metric">Dry Run</div>
            <p className="muted">Publishing is disabled.</p>
          </section>
          <section className="card">
            <div className="muted">Current phase</div>
            <div className="metric">Phase 9</div>
            <p className="muted">Insights, strategy selection, and human-reviewed AI suggestions.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
