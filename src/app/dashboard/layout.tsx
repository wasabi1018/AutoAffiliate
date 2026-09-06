import Link from "next/link";

import { DashboardNav } from "@/app/dashboard/dashboard-nav";
import { SignOutButton } from "@/app/dashboard/sign-out-button";

export default function DashboardLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <Link className="sidebar-brand" href="/dashboard">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span><strong>Auto Affiliater</strong><small>運用管理</small></span>
        </Link>
        <DashboardNav />
        <div className="sidebar-footer"><SignOutButton /></div>
      </aside>
      <div className="dashboard-body">
        <header className="mobile-header">
          <Link className="brand" href="/dashboard">Auto Affiliater</Link>
          <SignOutButton />
        </header>
        <div className="mobile-nav-wrap"><DashboardNav /></div>
        {children}
      </div>
    </div>
  );
}
