import { createClient } from "@/lib/supabase/server";

import { RankingPanel } from "@/app/dashboard/ranking/panel";

export const dynamic = "force-dynamic";

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

export default async function RankingPage() {
  const supabase = await createClient();
  const historyResult = await supabase
    .from("ranking_history")
    .select("id, provider, genre_id, captured_at, item_count, source_last_build_date")
    .order("captured_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let latestRun: { id: string; captured_at: string; item_count: number; genre_id: number | null; candidates: Candidate[] } | null = null;
  if (historyResult.data) {
    const candidatesResult = await supabase
      .from("product_selection_evaluations")
      .select("snapshot_id, eligible, score, reasons, product_snapshots(product_id, rank, name, price, availability, review_count, item_url, affiliate_url)")
      .eq("ranking_history_id", historyResult.data.id)
      .order("eligible", { ascending: false })
      .order("score", { ascending: false })
      .limit(20);

    const candidates = (candidatesResult.data || []).flatMap((row: Record<string, unknown>) => {
      const snapshot = row.product_snapshots as Record<string, unknown> | null;
      if (!snapshot) return [];
      return [{
        product_id: String(snapshot.product_id),
        rank: Number(snapshot.rank),
        name: String(snapshot.name),
        price: Number(snapshot.price),
        availability: Boolean(snapshot.availability),
        review_count: Number(snapshot.review_count),
        item_url: typeof snapshot.item_url === "string" ? snapshot.item_url : null,
        affiliate_url: typeof snapshot.affiliate_url === "string" ? snapshot.affiliate_url : null,
        eligible: Boolean(row.eligible),
        score: Number(row.score),
        reasons: Array.isArray(row.reasons) ? row.reasons.map(String) : [],
      }];
    });
    latestRun = {
      id: historyResult.data.id,
      captured_at: historyResult.data.captured_at,
      item_count: historyResult.data.item_count,
      genre_id: historyResult.data.genre_id,
      candidates,
    };
  }

  return (
    <main className="container main ranking-page">
      <div className="eyebrow">Phase 4 - Ranking</div>
      <h1>Product ranking dry run</h1>
      <p className="lede">Fetch Rakuten ranking data, apply the saved filters, and inspect selection reasons. Nothing is published.</p>
      {historyResult.error ? <p className="error" role="alert">Ranking history could not be loaded. Apply the Phase 4 migration and reload.</p> : null}
      <RankingPanel latestRun={latestRun} />
    </main>
  );
}
