import { aggregateBy, comparePeriods, latestSamples, type AnalyticsMetrics, type InsightSample } from "@/lib/analytics/aggregate";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata = { title: "成果分析" };

type Row = Record<string, unknown>;

export default async function AnalyticsPage() {
  const supabase = await createClient();
  const [snapshotsResult, postsResult, accountsResult, productsResult, jobsResult] = await Promise.all([
    supabase.from("post_insight_snapshots").select("post_set_post_id, post_id, window_label, captured_at, metrics_status, views, likes, replies, reposts, quotes, shares, clicks, ctr").order("captured_at", { ascending: false }).limit(500),
    supabase.from("post_set_posts").select("id, account_id, product_id, post_id, strategy, hook, published_at").eq("status", "published").limit(500),
    supabase.from("threads_accounts").select("id, display_name, genre"),
    supabase.from("products").select("id, name"),
    supabase.from("post_insight_jobs").select("status"),
  ]);

  const hasError = snapshotsResult.error || postsResult.error || accountsResult.error || productsResult.error || jobsResult.error;
  const accounts = new Map((accountsResult.data || []).map((account) => [account.id, account]));
  const products = new Map((productsResult.data || []).map((product) => [product.id, product.name]));
  const posts = new Map<string, Row>();
  for (const post of postsResult.data || []) {
    posts.set(post.id, post as Row);
    if (post.post_id) posts.set(post.post_id, post as Row);
  }
  const samples = (snapshotsResult.data || []).flatMap((snapshot) => toSample(snapshot as Row, posts, accounts));
  const now = samples.reduce((latest, sample) => Math.max(latest, Date.parse(sample.captured_at)), 0);
  const currentStart = now - 7 * 24 * 60 * 60 * 1000;
  const previousStart = now - 14 * 24 * 60 * 60 * 1000;
  const current = samples.filter((sample) => Date.parse(sample.published_at) >= currentStart);
  const previous = samples.filter((sample) => Date.parse(sample.published_at) >= previousStart && Date.parse(sample.published_at) < currentStart);
  const comparison = comparePeriods(current, previous);
  const latest = latestSamples(samples).sort((left, right) => right.published_at.localeCompare(left.published_at));
  const pendingJobs = (jobsResult.data || []).filter((job) => job.status === "queued" || job.status === "running").length;

  return (
    <main className="dashboard-main analytics-page">
      <div className="eyebrow">改善</div>
      <h1>成果分析</h1>
      <p className="lede">直近7日間の投稿成果を前の7日間と比較し、改善のヒントを確認します。</p>
      {hasError ? <p className="error notice" role="alert">分析データを読み込めませんでした。しばらくしてから再読み込みしてください。</p> : null}
      <section className="analytics-grid metrics-grid">
        <MetricCard label="直近7日間" metrics={comparison.current} />
        <MetricCard label="前の7日間" metrics={comparison.previous} />
        <section className="card"><div className="muted">集計待ち</div><div className="metric">{pendingJobs}<span className="metric-unit"> 件</span></div><p className="muted">予約時刻を過ぎると順次集計されます。</p></section>
      </section>
      <section className="card analytics-section">
        <div className="section-heading"><div><div className="eyebrow">内訳</div><h2>成果の内訳</h2></div><span className="muted">各投稿の最新データで集計</span></div>
        <div className="breakdown-grid">
          <Breakdown title="アカウント別" rows={aggregateBy(current, (sample) => sample.account_name)} />
          <Breakdown title="ジャンル別" rows={aggregateBy(current, (sample) => sample.genre)} />
          <Breakdown title="戦略別" rows={aggregateBy(current, (sample) => strategyLabel(sample.strategy))} />
          <Breakdown title="曜日別" rows={aggregateBy(current, (sample) => weekday(sample.published_at))} />
        </div>
      </section>
      <section className="card analytics-section">
        <div className="section-heading"><div><div className="eyebrow">投稿別</div><h2>最近の投稿成果</h2></div><span className="muted">最大30件</span></div>
        {latest.length === 0 ? <div className="empty-state"><strong>分析データはまだありません</strong><p>投稿後に成果データが集計されると、ここに表示されます。</p></div> : <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>投稿</th><th>公開日時</th><th>表示</th><th>いいね</th><th>返信</th><th>シェア</th><th>商品</th><th>取得状態</th></tr></thead><tbody>{latest.slice(0, 30).map((sample) => <tr key={`${sample.post_id}-${sample.window_label}`}><td><code>{sample.post_id.slice(0, 12)}…</code><div className="muted detail-copy">{sample.account_name}</div></td><td>{formatDate(sample.published_at)}</td><td>{displayMetric(sample.views)}</td><td>{displayMetric(sample.likes)}</td><td>{displayMetric(sample.replies)}</td><td>{displayMetric(sample.shares)}</td><td>{products.get(posts.get(sample.post_id)?.product_id || "") || "未設定"}</td><td>{sample.metrics_status === "available" ? "取得済み" : sample.metrics_status === "partial" ? "一部取得" : "未取得"}</td></tr>)}</tbody></table></div>}
      </section>
    </main>
  );
}

function toSample(snapshot: Row, posts: Map<string, Row>, accounts: Map<string, Row>): InsightSample[] {
  const post = posts.get(String(snapshot.post_set_post_id));
  if (!post || typeof post.published_at !== "string") return [];
  const account = accounts.get(String(post.account_id));
  return [{
    post_id: String(snapshot.post_id),
    account_name: typeof account?.display_name === "string" ? account.display_name : "不明なアカウント",
    genre: typeof account?.genre === "string" ? account.genre : "未設定",
    strategy: typeof post.strategy === "string" ? post.strategy : null,
    hook: typeof post.hook === "string" ? post.hook : null,
    published_at: post.published_at,
    captured_at: String(snapshot.captured_at),
    window_label: String(snapshot.window_label),
    metrics_status: snapshot.metrics_status === "available" || snapshot.metrics_status === "partial" ? snapshot.metrics_status : "unavailable",
    views: nullableNumber(snapshot.views),
    likes: nullableNumber(snapshot.likes),
    replies: nullableNumber(snapshot.replies),
    reposts: nullableNumber(snapshot.reposts),
    quotes: nullableNumber(snapshot.quotes),
    shares: nullableNumber(snapshot.shares),
    clicks: nullableNumber(snapshot.clicks),
    ctr: nullableNumber(snapshot.ctr),
  }];
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number.isFinite(Number(value)) ? Number(value) : null;
}

function displayMetric(value: number | null) {
  return value === null ? "未取得" : value.toLocaleString("ja-JP");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tokyo" }).format(new Date(value));
}

function weekday(value: string) {
  return ["日", "月", "火", "水", "木", "金", "土"][new Date(value).getUTCDay()] + "曜日";
}

function strategyLabel(value: string | null) { return value === "RANKING" ? "ランキング" : value === "SALE" ? "セール" : value === "TRENDING" ? "トレンド" : "未設定"; }

function MetricCard({ label, metrics }: { label: string; metrics: AnalyticsMetrics }) {
  return <section className="card"><div className="muted">{label}</div><div className="metric">{displayMetric(metrics.views)} <span className="metric-unit">表示</span></div><p className="muted">いいね {displayMetric(metrics.likes)} ・ 返信 {displayMetric(metrics.replies)} ・ シェア {displayMetric(metrics.shares)}</p></section>;
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ dimension: string; posts: number; views: number | null; engagement: number | null }> }) {
  return <div className="breakdown"><h3>{title}</h3>{rows.length === 0 ? <p className="muted">データなし</p> : <table className="mini-table"><thead><tr><th>項目</th><th>投稿</th><th>表示</th><th>反応</th></tr></thead><tbody>{rows.slice(0, 8).map((row) => <tr key={row.dimension}><td>{row.dimension.length > 28 ? row.dimension.slice(0, 28) + "…" : row.dimension}</td><td>{row.posts}</td><td>{displayMetric(row.views)}</td><td>{displayMetric(row.engagement)}</td></tr>)}</tbody></table>}</div>;
}
