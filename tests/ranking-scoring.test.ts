import { describe, expect, it } from "vitest";

import { evaluateRankingProduct } from "@/lib/ranking/scoring";

const weights = { ranking_weight: 60, sale_weight: 20, trending_weight: 20 };

describe("evaluateRankingProduct", () => {
  it("scores an eligible item and keeps the dry-run explanation", () => {
    const result = evaluateRankingProduct(
      { rank: 1, name: "Daily kitchen item", price: 1980, availability: true, review_count: 120 },
      { min_price: 1000, max_price: 3000, require_in_stock: true, min_review_count: 10, excluded_words: [] },
      weights,
      10,
    );

    expect(result.eligible).toBe(true);
    expect(result.score).toBe(60);
    expect(result.reasons).toContain("RANKING 100.0");
  });

  it("rejects items that violate configured filters", () => {
    const result = evaluateRankingProduct(
      { rank: 2, name: "Clearance forbidden item", price: 5000, availability: false, review_count: 1 },
      { min_price: 1000, max_price: 3000, require_in_stock: true, min_review_count: 10, excluded_words: ["forbidden"] },
      weights,
      10,
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(expect.arrayContaining(["Above maximum price", "Out of stock", "Insufficient reviews", "Excluded word: forbidden"]));
  });
});
