"use client";

import { FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

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
};

type Run = {
  id: string;
  captured_at: string;
  item_count: number;
  genre_id: number | null;
  candidates: Candidate[];
};

type FunctionRun = Omit<Run, "id" | "captured_at" | "genre_id"> & { ok: boolean; ranking_history_id: string; message?: string };

export function RankingPanel({ latestRun }: { latestRun: Run | null }) {
  const [run, setRun] = useState<Run | null>(latestRun);
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
      body: { genre_id: genreId || undefined, result_limit: Number(resultLimit) || 20 },
    });
    const result = data as FunctionRun | null;
    if (error || !result?.ok) {
      setMessage(result?.message || "Ranking dry run failed. Check Rakuten connection and Edge Function Secrets.");
    } else {
      setRun({ id: result.ranking_history_id, captured_at: new Date().toISOString(), item_count: result.item_count, genre_id: genreId ? Number(genreId) : null, candidates: result.candidates });
      setMessage("Dry run completed. No post was created.");
    }
    setBusy(false);
  }

  return (
    <div className="ranking-stack">
      <section className="card">
        <form className="settings-form" onSubmit={executeDryRun}>
          <div className="form-grid three">
            <div className="field"><label htmlFor="ranking-genre-id">Rakuten genre ID (optional)</label><input id="ranking-genre-id" inputMode="numeric" pattern="[0-9]*" value={genreId} onChange={(event) => setGenreId(event.target.value)} placeholder="All genres" /></div>
            <div className="field"><label htmlFor="ranking-result-limit">Results to display</label><input id="ranking-result-limit" type="number" min="1" max="50" value={resultLimit} onChange={(event) => setResultLimit(event.target.value)} /></div>
          </div>
          <button className="button" disabled={busy} type="submit">{busy ? "Running..." : "Run ranking dry run"}</button>
        </form>
        {message ? <p className="connection-message" role="status">{message}</p> : null}
      </section>
      {run ? <RankingResults run={run} /> : <section className="card"><p className="muted">No ranking run yet. Connect Rakuten, then start a dry run.</p></section>}
    </div>
  );
}

function RankingResults({ run }: { run: Run }) {
  return (
    <section className="card ranking-results">
      <div className="section-heading"><div><div className="eyebrow">Latest dry run</div><h2>{run.item_count} ranked items / {run.candidates.filter((candidate) => candidate.eligible).length} shown as eligible</h2></div><span className="muted">{new Date(run.captured_at).toLocaleString("en-US")}</span></div>
      <div className="ranking-table-wrap">
        <table className="ranking-table">
          <thead><tr><th>Rank</th><th>Product</th><th>Price</th><th>Score</th><th>Status</th><th>Selection reason</th></tr></thead>
          <tbody>{run.candidates.map((candidate) => <tr key={candidate.product_id}><td>{candidate.rank}</td><td>{candidate.item_url ? <a href={candidate.item_url} rel="noreferrer" target="_blank">{candidate.name}</a> : candidate.name}</td><td>¥{candidate.price.toLocaleString("ja-JP")}</td><td>{candidate.score.toFixed(2)}</td><td><span className={candidate.eligible ? "success" : "error"}>{candidate.eligible ? "Eligible" : "Filtered out"}</span></td><td><ul className="reason-list">{candidate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></td></tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}
