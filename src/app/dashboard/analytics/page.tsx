import { aggregateBy, comparePeriods, latestSamples, type AnalyticsMetrics, type InsightSample } from "@/lib/analytics/aggregate";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

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
    <main className="container main analytics-page">
      <div className="eyebrow">Phase 7 - Insights</div>
      <h1>Post performance</h1>
      <p className="lede">Review official Threads metrics over time and compare the last seven days with the previous seven days. Missing metrics stay unavailable instead of becoming zero.</p>
      {hasError ? <p className="error" role="alert">Analytics data could not be loaded. Apply the Phase 7 migration and reload.</p> : null}
      <section className="analytics-grid metrics-grid">
        <MetricCard label="Current 7 days" metrics={comparison.current} />
        <MetricCard label="Previous 7 days" metrics={comparison.previous} />
        <section className="card"><div className="muted">Insights jobs waiting</div><div className="metric">{pendingJobs}</div><p className="muted">The collector runs after its scheduled window.</p></section>
      </section>
      <section className="card analytics-section">
        <div className="section-heading"><div><div className="eyebrow">Breakdowns</div><h2>運用ディメンション別</h2></div><span className="muted">各投稿の最新スナップショットで集計</span></div>
        <div className="breakdown-grid">
          <Breakdown title="Account" rows={aggregateBy(current, (sample) => sample.account_name)} />
          <Breakdown title="Genre" rows={aggregateBy(current, (sample) => sample.genre)} />
          <Breakdown title="Strategy" rows={aggregateBy(current, (sample) => sample.strategy)} />
          <Breakdown title="Hook" rows={aggregateBy(current, (sample) => sample.hook)} />
          <Breakdown title="Weekday" rows={aggregateBy(current, (sample) => weekday(sample.published_at))} />
          <Breakdown title="Hour (UTC)" rows={aggregateBy(current, (sample) => String(new Date(sample.published_at).getUTCHours()).padStart(2, "0") + ":00")} />
        </div>
      </section>
      <section className="card analytics-section">
        <div className="section-heading"><div><div className="eyebrow">Post detail</div><h2>投稿とInsightsの履歴</h2></div><span className="muted">{samples.length} snapshots</span></div>
        {latest.length === 0 ? <p className="muted">No insights have been collected yet.</p> : <div className="analytics-table-wrap"><table className="analytics-table"><thead><tr><th>Post</th><th>Window</th><th>Published</th><th>Views</th><th>Likes</th><th>Replies</th><th>Shares</th><th>Product</th><th>Status</th></tr></thead><tbody>{latest.slice(0, 30).map((sample) => <tr key={`${sample.post_id}-${sample.window_label}`}><td><code>{sample.post_id.slice(0, 12)}…</code><div className="muted detail-copy">{sample.account_name}</div></td><td>{sample.window_label}</td><td>{formatDate(sample.published_at)}</td><td>{displayMetric(sample.views)}</td><td>{displayMetric(sample.likes)}</td><td>{displayMetric(sample.replies)}</td><td>{displayMetric(sample.shares)}</td><td>{products.get(posts.get(sample.post_id)?.product_id || "") || "未紐付け"}</td><td>{sample.metrics_status === "available" ? "取得済み" : sample.metrics_status === "partial" ? "一部取得" : "取得不能"}</td></tr>)}</tbody></table></div>}
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
    account_name: typeof account?.display_name === "string" ? account.display_name : "Unknown account",
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
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(value).getUTCDay()];
}

function MetricCard({ label, metrics }: { label: string; metrics: AnalyticsMetrics }) {
  return <section className="card"><div className="muted">{label}</div><div className="metric">{displayMetric(metrics.views)} <span className="metric-unit">views</span></div><p className="muted">Likes {displayMetric(metrics.likes)} ・ Replies {displayMetric(metrics.replies)} ・ Shares {displayMetric(metrics.shares)}</p></section>;
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ dimension: string; posts: number; views: number | null; engagement: number | null }> }) {
  return <div className="breakdown"><h3>{title}</h3>{rows.length === 0 ? <p className="muted">No data</p> : <table className="mini-table"><thead><tr><th>Dimension</th><th>Posts</th><th>Views</th><th>Engagement</th></tr></thead><tbody>{rows.slice(0, 8).map((row) => <tr key={row.dimension}><td>{row.dimension.length > 28 ? row.dimension.slice(0, 28) + "…" : row.dimension}</td><td>{row.posts}</td><td>{displayMetric(row.views)}</td><td>{displayMetric(row.engagement)}</td></tr>)}</tbody></table>}</div>;
}
