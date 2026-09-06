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
          <SignOutButton />
        </div>
      </header>
      <main className="container main">
        <div className="eyebrow">Administrator dashboard</div>
        <h1>Affiliate operations, ready for safe setup.</h1>
        <p className="lede">Phase 1 foundation and Phase 2 settings are ready. Phase 3 adds connection checks for Threads and Rakuten without publishing.</p>
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
            <div className="metric">Phase 3</div>
            <p className="muted">Threads, Rakuten, validation, and provider checks.</p>
          </section>
        </div>
      </main>
    </div>
  );
}
