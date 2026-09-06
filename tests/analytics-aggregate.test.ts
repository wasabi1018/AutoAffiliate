import { describe, expect, it } from "vitest";

import { aggregateBy, comparePeriods, latestSamples } from "@/lib/analytics/aggregate";

const sample = (overrides: Partial<Parameters<typeof latestSamples>[0][number]> = {}) => ({
  post_id: "post-1",
  account_name: "Main",
  genre: "gadgets",
  strategy: "RANKING",
  hook: "Best pick",
  published_at: "2026-09-01T10:00:00.000Z",
  captured_at: "2026-09-04T10:00:00.000Z",
  window_label: "72h",
  metrics_status: "available" as const,
  views: 100,
  likes: 4,
  replies: 2,
  reposts: 1,
  quotes: 0,
  shares: 0,
  clicks: null,
  ctr: null,
  ...overrides,
});

describe("analytics aggregation", () => {
  it("keeps the latest snapshot per post and preserves zero metrics", () => {
    const result = latestSamples([
      sample({ captured_at: "2026-09-04T08:00:00.000Z", likes: 3 }),
      sample({ captured_at: "2026-09-04T10:00:00.000Z", likes: 0 }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].likes).toBe(0);
  });

  it("does not turn unavailable metrics into zero", () => {
    const [row] = aggregateBy([sample({ views: null, likes: null, replies: null, reposts: null, quotes: null, shares: null })], (item) => item.genre);
    expect(row.views).toBeNull();
    expect(row.engagement).toBeNull();
  });

  it("compares periods without inventing CTR", () => {
    const result = comparePeriods([sample()], [sample({ post_id: "post-2", views: 80, likes: 1 })]);
    expect(result.current.views).toBe(100);
    expect(result.previous.likes).toBe(1);
    expect(result.current.ctr).toBeNull();
  });
});
