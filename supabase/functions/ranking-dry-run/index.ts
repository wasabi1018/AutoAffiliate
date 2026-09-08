import {
  adminClient,
  decryptSecret,
  fetchJson,
  json,
  ProviderError,
  record,
  requiredString,
  requireAdmin,
  safeError,
} from "../_shared/http.ts";
import { withPrivateDb } from "../_shared/db.ts";
import { rakutenItems } from "../_shared/rakuten.ts";
import { evaluateRankingProduct, type RankingFilters, type RankingWeights } from "../_shared/scoring.ts";

type NormalizedItem = {
  external_item_code: string;
  name: string;
  item_url: string | null;
  affiliate_url: string | null;
  image_url: string | null;
  price: number;
  availability: boolean;
  review_count: number;
  review_average: number | null;
  genre_id: number | null;
  shop_name: string | null;
  rank: number;
  sale_start_time: string | null;
  sale_end_time: string | null;
  point_rate: number | null;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = record(await request.json());
    const { service } = await requireAdmin(request);
    const accountId = parseOptionalUuid(body.account_id, "account_id");
    const accountGenreId = await assertActiveAccount(service, accountId);
    const genreId = parseOptionalPositiveInt(body.genre_id, 'genre_id') ?? accountGenreId;
    const page = parsePositiveInt(body.page, "page", 1, 34);
    const resultLimit = parsePositiveInt(body.result_limit, "result_limit", 1, 50);

    const filters = await readFilters(service);
    const weights = await readWeights(service, accountId);
    const credentials = await readRakutenCredentials();
    const response = await fetchRanking(credentials, { genreId, page });
    const items = normalizeItems(rakutenItems(response), genreId);
    if (items.length === 0) throw new ProviderError("INVALID_RESPONSE", "Rakuten returned no valid ranking items.");

    const historyResult = await service.from("ranking_history").insert({
      provider: "rakuten",
      genre_id: genreId,
      source_last_build_date: typeof response.lastBuildDate === "string" ? response.lastBuildDate : null,
      request_params: { account_id: accountId, genre_id: genreId, page, result_limit: resultLimit },
      item_count: items.length,
    }).select("id").single();
    if (historyResult.error || !historyResult.data) throw new ProviderError("STORAGE_ERROR", "Could not save ranking history.", 500);

    const maxRank = Math.max(...items.map((item) => item.rank));
    const evaluations: Array<Record<string, unknown>> = [];
    for (const item of items) {
      const productResult = await service.from("products").upsert({
        provider: "rakuten",
        external_item_code: item.external_item_code,
        name: item.name,
        item_url: item.item_url,
        affiliate_url: item.affiliate_url,
        image_url: item.image_url,
        price: item.price,
        availability: item.availability,
        review_count: item.review_count,
        review_average: item.review_average,
        genre_id: item.genre_id,
        shop_name: item.shop_name,
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider,external_item_code" }).select("id").single();
      if (productResult.error || !productResult.data) throw new ProviderError("STORAGE_ERROR", "Could not save a product.", 500);

      const historyResultForProduct = await service.from("product_snapshots").select("rank, captured_at").eq("product_id", productResult.data.id).neq("ranking_history_id", historyResult.data.id).order("captured_at", { ascending: true }).limit(8);
      if (historyResultForProduct.error) throw new ProviderError("STORAGE_ERROR", "Could not load product rank history.", 500);
      const rankHistory = (historyResultForProduct.data || []).map((point) => ({ captured_at: point.captured_at, rank: point.rank }));
      rankHistory.push({ captured_at: new Date().toISOString(), rank: item.rank });

      const snapshotResult = await service.from("product_snapshots").insert({
        ranking_history_id: historyResult.data.id,
        product_id: productResult.data.id,
        rank: item.rank,
        name: item.name,
        price: item.price,
        availability: item.availability,
        review_count: item.review_count,
        review_average: item.review_average,
        item_url: item.item_url,
        affiliate_url: item.affiliate_url,
        image_url: item.image_url,
        sale_start_time: item.sale_start_time,
        sale_end_time: item.sale_end_time,
        point_rate: item.point_rate,
      }).select("id").single();
      if (snapshotResult.error || !snapshotResult.data) throw new ProviderError("STORAGE_ERROR", "Could not save a product snapshot.", 500);

      const evaluation = evaluateRankingProduct(item, filters, weights, maxRank, new Date(), rankHistory);
      const evaluationResult = await service.from("product_selection_evaluations").insert({
        ranking_history_id: historyResult.data.id,
        snapshot_id: snapshotResult.data.id,
        eligible: evaluation.eligible,
        score: evaluation.score,
        ranking_score: evaluation.ranking_score,
        sale_score: evaluation.sale_score,
        trending_score: evaluation.trending_score,
        selected_strategy: evaluation.selected_strategy,
        strategy_evidence: evaluation.strategy_evidence,
        reasons: evaluation.reasons,
      });
      if (evaluationResult.error) throw new ProviderError("STORAGE_ERROR", "Could not save a product evaluation.", 500);

      evaluations.push({
        product_id: productResult.data.id,
        rank: item.rank,
        name: item.name,
        price: item.price,
        availability: item.availability,
        review_count: item.review_count,
        item_url: item.item_url,
        affiliate_url: item.affiliate_url,
        image_url: item.image_url,
        eligible: evaluation.eligible,
        score: evaluation.score,
        reasons: evaluation.reasons,
        selected_strategy: evaluation.selected_strategy,
      });
    }

    evaluations.sort((left, right) => {
      if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
      return Number(right.score) - Number(left.score) || Number(left.rank) - Number(right.rank);
    });

    return json({
      ok: true,
      mode: "dry_run",
      provider: "rakuten",
      ranking_history_id: historyResult.data.id,
      item_count: items.length,
      eligible_count: evaluations.filter((item) => item.eligible).length,
      candidates: evaluations.slice(0, resultLimit),
    });
  } catch (error) {
    const safe = safeError(error);
    return json({ ok: false, error: safe.code, message: safe.message }, safe.status);
  }
});

async function readRakutenCredentials() {
  const row = await withPrivateDb(async (db) => {
    const result = await db.queryObject("select '\\x' || encode(ciphertext, 'hex') as ciphertext from private.integration_secrets where provider = 'rakuten'");
    return result.rows[0] as { ciphertext: string } | undefined;
  });
  if (!row) throw new ProviderError("NOT_CONNECTED", "Connect Rakuten before running a dry run.", 400);
  const secret = await decryptSecret(row.ciphertext);
  return {
    applicationId: requiredString(secret.application_id, "application_id"),
    accessKey: requiredString(secret.access_key, "access_key"),
    affiliateId: typeof secret.affiliate_id === "string" ? secret.affiliate_id : "",
  };
}

async function fetchRanking(credentials: { applicationId: string; accessKey: string; affiliateId: string }, options: { genreId: number | null; page: number }) {
  const url = new URL("https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601");
  url.searchParams.set("format", "json");
  url.searchParams.set("formatVersion", "2");
  url.searchParams.set("applicationId", credentials.applicationId);
  url.searchParams.set("page", String(options.page));
  if (options.genreId !== null) url.searchParams.set("genreId", String(options.genreId));
  if (credentials.affiliateId) url.searchParams.set("affiliateId", credentials.affiliateId);
  return record(await fetchJson(url, { headers: {
    accessKey: credentials.accessKey,
    Origin: "https://autoaffiliate-orcin.vercel.app",
    Referer: "https://autoaffiliate-orcin.vercel.app/",
  } }));
}

function normalizeItems(value: unknown, genreId: number | null): NormalizedItem[] {
  if (!Array.isArray(value)) throw new ProviderError("INVALID_RESPONSE", "Rakuten returned an invalid item list.");
  return value.map((raw, index) => {
    const item = record(raw);
    return {
      external_item_code: requiredString(item.itemCode, "itemCode"),
      name: requiredString(item.itemName, "itemName"),
      item_url: optionalUrl(item.itemUrl),
      affiliate_url: optionalUrl(item.affiliateUrl),
      image_url: firstUrl(item.mediumImageUrls) || firstUrl(item.smallImageUrls),
      price: requiredNumber(item.itemPrice, "itemPrice"),
      availability: item.availability === 1 || item.availability === "1" || item.availability === true,
      review_count: optionalNumber(item.reviewCount) || 0,
      review_average: optionalNumber(item.reviewAverage),
      genre_id: optionalNumber(item.genreId) || genreId,
      shop_name: typeof item.shopName === "string" ? item.shopName : null,
      rank: optionalNumber(item.rank) || index + 1,
      sale_start_time: normalizeDate(item.startTime),
      sale_end_time: normalizeDate(item.endTime),
      point_rate: optionalNumber(item.pointRate),
    };
  });
}

async function readFilters(service: ReturnType<typeof adminClient>): Promise<RankingFilters> {
  const result = await service.from("product_filters").select("min_price, max_price, require_in_stock, min_review_count, excluded_words").eq("id", true).maybeSingle();
  if (result.error) throw new ProviderError("STORAGE_ERROR", "Could not load product filters.", 500);
  return result.data || { min_price: 0, max_price: null, require_in_stock: true, min_review_count: 0, excluded_words: [] };
}

async function readWeights(service: ReturnType<typeof adminClient>, accountId: string | null): Promise<RankingWeights> {
  const globalResult = await service.from("strategy_settings").select("ranking_weight, sale_weight, trending_weight").eq("id", true).maybeSingle();
  if (globalResult.error) throw new ProviderError("STORAGE_ERROR", "Could not load selection strategy.", 500);
  if (accountId) {
    const accountResult = await service.from("account_strategy_settings").select("ranking_weight, sale_weight, trending_weight").eq("account_id", accountId).maybeSingle();
    if (accountResult.error) throw new ProviderError("STORAGE_ERROR", "Could not load account selection strategy.", 500);
    if (accountResult.data) return accountResult.data as RankingWeights;
  }
  return (globalResult.data || { ranking_weight: 60, sale_weight: 20, trending_weight: 20 }) as RankingWeights;
}

async function assertActiveAccount(service: ReturnType<typeof adminClient>, accountId: string | null) {
  if (!accountId) return null;
  const result = await service.from('threads_accounts').select('id, status, genre_id, genre_ids').eq('id', accountId).maybeSingle();
  if (result.error) throw new ProviderError("STORAGE_ERROR", "Could not load the strategy account.", 500);
  if (!result.data || result.data.status !== "active") {
    throw new ProviderError("ACCOUNT_NOT_ACTIVE", "The strategy account is not active.", 400);
  }
  const primaryGenreId = Array.isArray(result.data.genre_ids) ? result.data.genre_ids[0] : result.data.genre_id;
  return typeof primaryGenreId === 'number' && primaryGenreId > 0 ? primaryGenreId : null;
}

function parseOptionalUuid(value: unknown, name: string) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^[0-9a-f-]{36}$/i.test(value)) throw new ProviderError("INVALID_INPUT", name + " is invalid.", 400);
  return value;
}

function parsePositiveInt(value: unknown, name: string, fallback: number, max: number) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new ProviderError("INVALID_INPUT", name + " must be between 1 and " + max + ".", 400);
  return parsed;
}

function parseOptionalPositiveInt(value: unknown, name: string) {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new ProviderError("INVALID_INPUT", name + " must be a positive integer.", 400);
  return parsed;
}

function requiredNumber(value: unknown, name: string) {
  const parsed = optionalNumber(value);
  if (parsed === null || parsed < 0) throw new ProviderError("INVALID_RESPONSE", name + " is invalid.");
  return parsed;
}

function optionalNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function optionalUrl(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function firstUrl(value: unknown) {
  return Array.isArray(value) ? value.map(optionalUrl).find((url): url is string => Boolean(url)) || null : null;
}

function normalizeDate(value: unknown) {
  if (typeof value !== "string" || !value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
