"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Account = { id: string; display_name: string; handle: string; status: string };
type Candidate = {
  product_id: string;
  rank: number;
  name: string;
  price: number;
  availability: boolean;
  review_count: number;
  item_url: string | null;
  affiliate_url: string | null;
  eligible: boolean;
  score: number;
  reasons: string[];
  selected_strategy: "RANKING" | "SALE" | "TRENDING";
};
type Run = { id: string; captured_at: string; item_count: number; genre_id: number | null; candidates: Candidate[] };
type FunctionRun = Omit<Run, "id" | "captured_at" | "genre_id"> & { ok: boolean; ranking_history_id: string; message?: string };

export function RankingPanel({ accounts, latestRun }: { accounts: Account[]; latestRun: Run | null }) {
  const [run, setRun] = useState<Run | null>(latestRun);
  const [accountId, setAccountId] = useState("");
  const [genreId, setGenreId] = useState("");
  const [resultLimit, setResultLimit] = useState("20");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function executeDryRun(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("ranking-dry-run", {
      body: { account_id: accountId || undefined, genre_id: genreId || undefined, result_limit: Number(resultLimit) || 20 },
    });
    const result = data as FunctionRun | null;
    if (error || !result?.ok) {
      setMessage(result?.message || "商品候補を取得できませんでした。楽天の接続状態を確認してください。");
    } else {
      setRun({ id: result.ranking_history_id, captured_at: new Date().toISOString(), item_count: result.item_count, genre_id: genreId ? Number(genreId) : null, candidates: result.candidates });
      setMessage("商品候補の評価が完了しました。投稿はまだ作成されていません。");
    }
    setBusy(false);
  }

  return (
    <div className="ranking-stack">
      <section className="card">
        <div className="section-heading"><div><div className="eyebrow">候補を取得</div><h2>評価条件</h2></div></div>
        <form className="settings-form" onSubmit={executeDryRun}>
          <div className="form-grid three">
            <div className="field"><label htmlFor="ranking-account">アカウント（任意）</label><select id="ranking-account" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">共通設定を使用</option>{accounts.filter((account) => account.status === "active").map((account) => <option key={account.id} value={account.id}>{account.display_name} (@{account.handle})</option>)}</select></div>
            <div className="field"><label htmlFor="ranking-genre-id">楽天ジャンルID（任意）</label><input id="ranking-genre-id" inputMode="numeric" pattern="[0-9]*" value={genreId} onChange={(event) => setGenreId(event.target.value)} placeholder="すべてのジャンル" /></div>
            <div className="field"><label htmlFor="ranking-result-limit">表示件数</label><input id="ranking-result-limit" type="number" min="1" max="50" value={resultLimit} onChange={(event) => setResultLimit(event.target.value)} /></div>
          </div>
          <button className="button" disabled={busy} type="submit">{busy ? "評価中…" : "商品候補を評価"}</button>
        </form>
        {message ? <p className="connection-message" role="status">{message}</p> : null}
      </section>
      {run ? <RankingResults run={run} /> : <section className="card empty-state"><strong>商品候補はまだありません</strong><p>楽天を接続してから、商品候補を評価してください。</p></section>}
    </div>
  );
}

function RankingResults({ run }: { run: Run }) {
  return (
    <section className="card ranking-results">
      <div className="section-heading"><div><div className="eyebrow">評価結果</div><h2>{run.item_count}件中 {run.candidates.filter((candidate) => candidate.eligible).length}件が候補</h2></div><span className="muted">{new Date(run.captured_at).toLocaleString("ja-JP")}</span></div>
      <div className="ranking-table-wrap">
        <table className="ranking-table">
          <thead><tr><th>順位</th><th>商品</th><th>価格</th><th>評価</th><th>戦略</th><th>判定</th><th>主な理由</th></tr></thead>
          <tbody>{run.candidates.map((candidate) => <tr key={candidate.product_id}><td>{candidate.rank}</td><td>{candidate.item_url ? <a href={candidate.item_url} rel="noreferrer" target="_blank">{candidate.name}</a> : candidate.name}</td><td>¥{candidate.price.toLocaleString("ja-JP")}</td><td>{candidate.score.toFixed(1)}</td><td>{strategyLabel(candidate.selected_strategy)}</td><td><span className={`status-badge ${candidate.eligible ? "success" : "neutral"}`}>{candidate.eligible ? "候補" : "対象外"}</span></td><td><ul className="reason-list">{candidate.reasons.slice(0, 3).map((reason) => <li key={reason}>{reasonLabel(reason)}</li>)}</ul></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function strategyLabel(strategy: Candidate["selected_strategy"]) { return { RANKING: "ランキング", SALE: "セール", TRENDING: "トレンド" }[strategy]; }
function reasonLabel(reason: string) {
  if (reason === "Below minimum price") return "最低価格を下回っています";
  if (reason === "Above maximum price") return "最高価格を超えています";
  if (reason === "Out of stock") return "在庫がありません";
  if (reason === "Insufficient reviews") return "レビュー数が不足しています";
  if (reason.startsWith("Excluded word: ")) return `除外語を含みます：${reason.slice(15)}`;
  if (reason.startsWith("RANKING ")) return `ランキング評価 ${reason.slice(8)}`;
  if (reason === "Active SALE from API window") return "セール期間中です";
  if (reason === "No active SALE data") return "セール情報はありません";
  if (reason.startsWith("TRENDING history insufficient")) return "トレンド判定の履歴が不足しています";
  if (reason === "TRENDING persistence not sufficient") return "継続的な順位上昇はありません";
  if (reason.startsWith("TRENDING persistent improvement ")) return `順位が継続して上昇しています ${reason.slice(32)}`;
  return reason;
}
