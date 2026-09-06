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

export type RankHistoryPoint = {
  captured_at: string;
  rank: number;
};

export type RankingEvaluation = {
  eligible: boolean;
  score: number;
  ranking_score: number;
  sale_score: number;
  trending_score: number;
  selected_strategy: "RANKING" | "SALE" | "TRENDING";
  strategy_evidence: Record<string, unknown>;
  reasons: string[];
};

export function evaluateRankingProduct(
  product: RankingProduct,
  filters: RankingFilters,
  weights: RankingWeights,
  maxRank: number,
  now = new Date(),
  rankHistory: RankHistoryPoint[] = [],
): RankingEvaluation {
  const reasons: string[] = [];
  const normalizedName = product.name.toLocaleLowerCase();
  const excludedWord = filters.excluded_words.find((word) => normalizedName.includes(word.toLocaleLowerCase()));
  const filterFailures: string[] = [];

  if (product.price < filters.min_price) filterFailures.push("Below minimum price");
  if (filters.max_price !== null && product.price > filters.max_price) filterFailures.push("Above maximum price");
  if (filters.require_in_stock && !product.availability) filterFailures.push("Out of stock");
  if (product.review_count < filters.min_review_count) filterFailures.push("Insufficient reviews");
  if (excludedWord) filterFailures.push("Excluded word: " + excludedWord);
  reasons.push(...filterFailures);

  const safeMaxRank = Math.max(1, maxRank);
  const rankingScore = Math.max(0, Math.min(100, ((safeMaxRank - product.rank + 1) / safeMaxRank) * 100));
  const sale = saleEvidence(product, now);
  const trending = calculateTrendingScore(rankHistory);
  const saleScore = sale.active ? 100 : 0;
  const score = (rankingScore * weights.ranking_weight + saleScore * weights.sale_weight + trending.score * weights.trending_weight) / 100;
  const contributions = { RANKING: rankingScore * weights.ranking_weight, SALE: saleScore * weights.sale_weight, TRENDING: trending.score * weights.trending_weight };
  const strategies: Array<"RANKING" | "SALE" | "TRENDING"> = ["RANKING", "SALE", "TRENDING"];
  const selectedStrategy = strategies.sort((left, right) => contributions[right] - contributions[left])[0];

  reasons.push("RANKING " + rankingScore.toFixed(1));
  reasons.push(sale.active ? "Active SALE from API window" : "No active SALE data");
  reasons.push(trending.reason);

  return {
    eligible: filterFailures.length === 0,
    score: round(score),
    ranking_score: round(rankingScore),
    sale_score: saleScore,
    trending_score: trending.score,
    selected_strategy: selectedStrategy,
    strategy_evidence: {
      sale: { active: sale.active, has_api_window: sale.hasApiWindow, start: sale.start, end: sale.end },
      trending: { history_points: rankHistory.length, score: trending.score, eligible: trending.eligible },
      contributions,
    },
    reasons,
  };
}

export function saleEvidence(product: RankingProduct, now = new Date()) {
  const start = validDate(product.sale_start_time);
  const end = validDate(product.sale_end_time);
  const timestamp = now.getTime();
  const active = (start !== null || end !== null)
    && timestamp >= (start ?? Number.NEGATIVE_INFINITY)
    && timestamp <= (end ?? Number.POSITIVE_INFINITY);
  return { active, hasApiWindow: start !== null || end !== null, start: product.sale_start_time || null, end: product.sale_end_time || null };
}

export function calculateTrendingScore(history: RankHistoryPoint[]) {
  const points = history
    .filter((point) => Number.isInteger(point.rank) && point.rank > 0 && Number.isFinite(new Date(point.captured_at).getTime()))
    .sort((left, right) => left.captured_at.localeCompare(right.captured_at));
  if (points.length < 3) return { score: 0, eligible: false, reason: "TRENDING history insufficient (need 3 points)" };

  let consecutiveImprovements = 0;
  for (let index = 1; index < points.length; index += 1) {
    if (points[index - 1].rank > points[index].rank) consecutiveImprovements += 1;
  }
  const overallImprovement = points[0].rank - points.at(-1)!.rank;
  if (overallImprovement <= 0 || consecutiveImprovements < 2) {
    return { score: 0, eligible: false, reason: "TRENDING persistence not sufficient" };
  }

  const baseline = Math.max(1, points[0].rank);
  const improvementRatio = Math.min(1, overallImprovement / baseline);
  const continuity = consecutiveImprovements / (points.length - 1);
  const recentImprovement = points.at(-2)!.rank - points.at(-1)!.rank;
  const acceleration = recentImprovement > 0 ? Math.min(1, recentImprovement / baseline) : 0;
  const score = round(improvementRatio * 60 + continuity * 25 + acceleration * 15);
  return { score, eligible: score > 0, reason: "TRENDING persistent improvement " + score.toFixed(1) };
}

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
