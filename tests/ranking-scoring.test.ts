import { describe, expect, it } from "vitest";

import { calculateTrendingScore, evaluateRankingProduct } from "@/lib/ranking/scoring";

const weights = { ranking_weight: 60, sale_weight: 20, trending_weight: 20 };
const filters = { min_price: 1000, max_price: 3000, require_in_stock: true, min_review_count: 10, excluded_words: ["forbidden"] };

describe("evaluateRankingProduct", () => {
  it("scores an eligible item and keeps the dry-run explanation", () => {
    const result = evaluateRankingProduct({ rank: 1, name: "Daily kitchen item", price: 1980, availability: true, review_count: 120 }, filters, weights, 10);
    expect(result.eligible).toBe(true);
    expect(result.score).toBe(60);
    expect(result.selected_strategy).toBe("RANKING");
    expect(result.reasons).toContain("RANKING 100.0");
  });

  it("rejects items that violate configured filters", () => {
    const result = evaluateRankingProduct({ rank: 2, name: "Clearance forbidden item", price: 5000, availability: false, review_count: 1 }, filters, weights, 10);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(["Above maximum price", "Out of stock", "Insufficient reviews", "Excluded word: forbidden"]));
  });

  it("requires persistent rank improvement before scoring TRENDING", () => {
    const result = calculateTrendingScore([
      { captured_at: "2026-09-01T00:00:00.000Z", rank: 20 },
      { captured_at: "2026-09-02T00:00:00.000Z", rank: 12 },
      { captured_at: "2026-09-03T00:00:00.000Z", rank: 7 },
    ]);
    expect(result.eligible).toBe(true);
    expect(result.score).toBeGreaterThan(0);

    const noisy = calculateTrendingScore([
      { captured_at: "2026-09-01T00:00:00.000Z", rank: 20 },
      { captured_at: "2026-09-02T00:00:00.000Z", rank: 5 },
      { captured_at: "2026-09-03T00:00:00.000Z", rank: 20 },
    ]);
    expect(noisy.eligible).toBe(false);
  });

  it("uses API sale-window evidence only", () => {
    const result = evaluateRankingProduct(
      { rank: 4, name: "Sale item", price: 1200, availability: true, review_count: 20, sale_start_time: "2026-09-01T00:00:00.000Z", sale_end_time: "2026-09-10T00:00:00.000Z" },
      { min_price: 0, max_price: null, require_in_stock: false, min_review_count: 0, excluded_words: [] },
      { ranking_weight: 20, sale_weight: 70, trending_weight: 10 },
      10,
      new Date("2026-09-05T00:00:00.000Z"),
    );
    expect(result.sale_score).toBe(100);
    expect(result.selected_strategy).toBe("SALE");
    expect(result.reasons).toContain("Active SALE from API window");
  });
});
