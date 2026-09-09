import Link from "next/link";

export default function HomePage() {
  return (
    <div className="shell">
      <header className="container topbar">
        <Link className="brand" href="/">Auto Affiliater</Link>
        <Link className="nav-link" href="/login">管理者ログイン</Link>
      </header>
      <main className="container main">
        <section className="hero landing-hero">
          <div className="eyebrow">投稿運用を、ひとつの画面で</div>
          <h1>Threads運用を<br />もっとシンプルに。</h1>
          <p className="lede">
            商品選定から投稿、成果の振り返りまでをまとめて管理できます。
            重要な変更は確認してから反映されるため、安心して運用できます。
          </p>
          <Link className="button" href="/login">管理画面を開く</Link>
        </section>
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
