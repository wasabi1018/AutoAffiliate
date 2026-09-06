import Link from "next/link";

export default function NotFound() {
  return <main className="container main"><section className="card"><h2>ページが見つかりません。</h2><Link className="button" href="/">トップへ戻る</Link></section></main>;
}
