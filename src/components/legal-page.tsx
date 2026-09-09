import Link from "next/link";
import type { ReactNode } from "react";

type LegalPageProps = {
  eyebrow: string;
  title: string;
  updatedAt: string;
  children: ReactNode;
};

export function LegalPage({
  eyebrow,
  title,
  updatedAt,
  children,
}: LegalPageProps) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/">
          Auto Affiliater
        </Link>
        <Link className="nav-link" href="/">
          トップへ戻る
        </Link>
      </header>

      <main className="main legal-main">
        <article className="card legal-card">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="muted legal-updated">最終更新日: {updatedAt}</p>
          <div className="legal-content">{children}</div>
        </article>
      </main>

      <footer className="container footer legal-footer">
        <span>Auto Affiliater</span>
        <nav aria-label="法的情報">
          <Link href="/privacy">プライバシーポリシー</Link>
          <Link href="/terms">利用規約</Link>
          <Link href="/data-deletion">データ削除手順</Link>
        </nav>
      </footer>
    </div>
  );
}