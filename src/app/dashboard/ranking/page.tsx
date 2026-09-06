import { createClient } from "@/lib/supabase/server";

import { RankingPanel } from "@/app/dashboard/ranking/panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "商品選定" };

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

export default async function RankingPage() {
  const supabase = await createClient();
  const [historyResult, accountsResult] = await Promise.all([
    supabase.from("ranking_history").select("id, provider, genre_id, captured_at, item_count, source_last_build_date").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("threads_accounts").select("id, display_name, handle, status").order("created_at", { ascending: true }),
  ]);

  let latestRun: Run | null = null;
  if (historyResult.data) {
    const candidatesResult = await supabase
      .from("product_selection_evaluations")
      .select("snapshot_id, selected_strategy, eligible, score, reasons, product_snapshots(product_id, rank, name, price, availability, review_count, item_url, affiliate_url)")
      .eq("ranking_history_id", historyResult.data.id)
      .order("eligible", { ascending: false })
      .order("score", { ascending: false })
      .limit(20);

    const candidates = (candidatesResult.data || []).flatMap((row: Record<string, unknown>) => {
      const snapshot = row.product_snapshots as Record<string, unknown> | null;
      if (!snapshot) return [];
      const selectedStrategy: Candidate["selected_strategy"] = row.selected_strategy === "SALE" || row.selected_strategy === "TRENDING" ? row.selected_strategy : "RANKING";
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
        selected_strategy: selectedStrategy,
      }];
    });
    latestRun = { id: historyResult.data.id, captured_at: historyResult.data.captured_at, item_count: historyResult.data.item_count, genre_id: historyResult.data.genre_id, candidates };
  }

  return (
    <main className="dashboard-main ranking-page">
      <div className="eyebrow">運用</div>
      <h1>商品選定</h1>
      <p className="lede">楽天の商品候補を取得し、設定した条件と戦略で投稿に向く商品を評価します。</p>
      {historyResult.error || accountsResult.error ? <p className="error notice" role="alert">商品候補を読み込めませんでした。接続状態を確認して再読み込みしてください。</p> : null}
      <RankingPanel accounts={(accountsResult.data || []) as Account[]} latestRun={latestRun} />
    </main>
  );
}
