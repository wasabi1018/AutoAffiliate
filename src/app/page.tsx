import Link from "next/link";

export default function HomePage() {
  return (
    <div className="shell">
      <header className="container topbar">
        <Link className="brand" href="/">Auto Affiliater</Link>
        <Link className="nav-link" href="/login">管理者ログイン</Link>
      </header>
      <main className="container main">
        <section className="hero">
          <div className="eyebrow">Phase 1 · Foundation</div>
          <h1>安全な投稿運用のための基盤。</h1>
          <p className="lede">
            Threadsと楽天アフィリエイトの運用を、管理者1名のための安全な管理画面から始めます。
            現在はDry Runを前提としたプロジェクト基盤です。
          </p>
          <Link className="button" href="/login">管理画面へ進む</Link>
        </section>
      </main>
      <footer className="container footer">投稿機能は初期状態で無効です。</footer>
    </div>
  );
}
