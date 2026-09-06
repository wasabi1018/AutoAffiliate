export type InsightSample = {
  post_id: string;
  account_name: string;
  genre: string;
  strategy: string | null;
  hook: string | null;
  published_at: string;
  captured_at: string;
  window_label: string;
  metrics_status: "available" | "partial" | "unavailable";
  views: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  shares: number | null;
  clicks: number | null;
  ctr: number | null;
};

export type AnalyticsMetrics = {
  views: number | null;
  likes: number | null;
  replies: number | null;
  reposts: number | null;
  quotes: number | null;
  shares: number | null;
  clicks: number | null;
  ctr: number | null;
};

export type DimensionRow = AnalyticsMetrics & {
  dimension: string;
  posts: number;
  engagement: number | null;
};

export function latestSamples(samples: InsightSample[]) {
  const latest = new Map<string, InsightSample>();
  for (const sample of [...samples].sort((left, right) => right.captured_at.localeCompare(left.captured_at))) {
    if (!latest.has(sample.post_id)) latest.set(sample.post_id, sample);
  }
  return [...latest.values()];
}

export function aggregateBy(samples: InsightSample[], dimension: (sample: InsightSample) => string | null): DimensionRow[] {
  const groups = new Map<string, InsightSample[]>();
  for (const sample of latestSamples(samples)) {
    const key = dimension(sample) || "Unset";
    groups.set(key, [...(groups.get(key) || []), sample]);
  }

  return [...groups.entries()]
    .map(([key, group]) => {
      const metrics = sumMetrics(group);
      const engagement = sumNullable(group, ["likes", "replies", "reposts", "quotes", "shares"]);
      return { dimension: key, posts: group.length, ...metrics, engagement };
    })
    .sort((left, right) => (right.engagement ?? -1) - (left.engagement ?? -1) || right.posts - left.posts || left.dimension.localeCompare(right.dimension));
}

export function sumMetrics(samples: InsightSample[]): AnalyticsMetrics {
  return {
    views: sumNullable(samples, ["views"]),
    likes: sumNullable(samples, ["likes"]),
    replies: sumNullable(samples, ["replies"]),
    reposts: sumNullable(samples, ["reposts"]),
    quotes: sumNullable(samples, ["quotes"]),
    shares: sumNullable(samples, ["shares"]),
    clicks: sumNullable(samples, ["clicks"]),
    ctr: null,
  };
}

export function comparePeriods(current: InsightSample[], previous: InsightSample[]) {
  return { current: sumMetrics(latestSamples(current)), previous: sumMetrics(latestSamples(previous)) };
}

function sumNullable(samples: InsightSample[], keys: readonly (keyof InsightSample)[]) {
  const values = samples.flatMap((sample) => keys.map((key) => sample[key])).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return values.length === 0 ? null : values.reduce((total, value) => total + value, 0);
}
