"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  { label: "メイン", items: [
    { href: "/dashboard", label: "ホーム", exact: true },
    { href: "/dashboard/publishing", label: "投稿管理" },
    { href: "/dashboard/ranking", label: "商品選定" },
    { href: "/dashboard/jobs", label: "実行履歴" },
  ] },
  { label: "改善", items: [
    { href: "/dashboard/analytics", label: "成果分析" },
    { href: "/dashboard/suggestions", label: "AI提案" },
  ] },
  { label: "設定", items: [
    { href: "/dashboard/connections", label: "サービス連携" },
    { href: "/dashboard/settings", label: "運用設定" },
  ] },
];

export function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="管理画面メニュー" className="dashboard-nav">
      {groups.map((group) => (
        <div className="nav-group" key={group.label}>
          <div className="nav-group-label">{group.label}</div>
          {group.items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            return <Link aria-current={active ? "page" : undefined} className={active ? "side-nav-link active" : "side-nav-link"} href={item.href} key={item.href}>{item.label}</Link>;
          })}
        </div>
      ))}
    </nav>
  );
}
