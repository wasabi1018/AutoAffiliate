"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="container main">
      <section className="card">
        <div className="eyebrow">エラー</div>
        <h2>処理中にエラーが発生しました。</h2>
        <p className="muted">時間をおいて再試行してください。解決しない場合は管理者へ連絡してください。</p>
        <button className="button" onClick={reset} type="button">再試行</button>
      </section>
    </main>
  );
}
