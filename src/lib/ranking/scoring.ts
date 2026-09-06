export type RankingProduct = {
  rank: number;
  name: string;
  price: number;
  availability: boolean;
  review_count: number;
  sale_start_time?: string | null;
  sale_end_time?: string | null;
};

export type RankingFilters = {
  min_price: number;
  max_price: number | null;
  require_in_stock: boolean;
  min_review_count: number;
  excluded_words: string[];
};

export type RankingWeights = {
  ranking_weight: number;
  sale_weight: number;
  trending_weight: number;
};

export type RankingEvaluation = {
  eligible: boolean;
  score: number;
  ranking_score: number;
  sale_score: number;
  trending_score: number;
  reasons: string[];
};

export function evaluateRankingProduct(
  product: RankingProduct,
  filters: RankingFilters,
  weights: RankingWeights,
  maxRank: number,
  now = new Date(),
): RankingEvaluation {
  const reasons: string[] = [];
  const normalizedName = product.name.toLocaleLowerCase();
  const excludedWord = filters.excluded_words.find((word) => normalizedName.includes(word.toLocaleLowerCase()));

  if (product.price < filters.min_price) reasons.push("Below minimum price");
  if (filters.max_price !== null && product.price > filters.max_price) reasons.push("Above maximum price");
  if (filters.require_in_stock && !product.availability) reasons.push("Out of stock");
  if (product.review_count < filters.min_review_count) reasons.push("Insufficient reviews");
  if (excludedWord) reasons.push("Excluded word: " + excludedWord);

  const safeMaxRank = Math.max(1, maxRank);
  const rankingScore = Math.max(0, Math.min(100, ((safeMaxRank - product.rank + 1) / safeMaxRank) * 100));
  const saleScore = isActiveSale(product, now) ? 100 : 0;
  const trendingScore = 0;
  const score = (rankingScore * weights.ranking_weight + saleScore * weights.sale_weight + trendingScore * weights.trending_weight) / 100;

  reasons.push("RANKING " + rankingScore.toFixed(1));
  reasons.push(saleScore > 0 ? "Active SALE" : "No active SALE data");
  reasons.push("TRENDING history not available yet");

  return {
    eligible: reasons.every((reason) => !["Below minimum price", "Above maximum price", "Out of stock", "Insufficient reviews"].includes(reason) && !reason.startsWith("Excluded word:")),
    score: round(score),
    ranking_score: round(rankingScore),
    sale_score: round(saleScore),
    trending_score: trendingScore,
    reasons,
  };
}

function isActiveSale(product: RankingProduct, now: Date) {
  if (!product.sale_start_time && !product.sale_end_time) return false;
  const start = product.sale_start_time ? new Date(product.sale_start_time).getTime() : Number.NEGATIVE_INFINITY;
  const end = product.sale_end_time ? new Date(product.sale_end_time).getTime() : Number.POSITIVE_INFINITY;
  const timestamp = now.getTime();
  return Number.isFinite(start) || Number.isFinite(end) ? timestamp >= start && timestamp <= end : false;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
