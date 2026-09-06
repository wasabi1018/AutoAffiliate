import { adminClient, decryptSecret, fetchJson, ProviderError, record, requiredString } from './http.ts';
import { withPrivateDb } from './db.ts';
import { rakutenItems } from './rakuten.ts';
import { evaluateRankingProduct, type RankingFilters, type RankingWeights } from './scoring.ts';

type Service = ReturnType<typeof adminClient>;

type Candidate = {
  external_item_code: string;
  name: string;
  item_url: string | null;
  affiliate_url: string | null;
  image_url: string | null;
  price: number;
  availability: boolean;
  review_count: number;
  review_average: number | null;
  genre_id: number;
  shop_name: string | null;
  rank: number;
  sale_start_time: string | null;
  sale_end_time: string | null;
  point_rate: number | null;
};

export type AutomaticProduct = Candidate & {
  product_id: string;
  score: number;
  selected_strategy: 'RANKING' | 'SALE' | 'TRENDING';
};

export async function selectAutomaticProduct(service: Service, accountId: string, genreId: number): Promise<AutomaticProduct> {
  const [filters, weights, credentials] = await Promise.all([
    readFilters(service),
    readWeights(service, accountId),
    readRakutenCredentials(),
  ]);
  const response = await fetchRanking(credentials, genreId);
  const items = normalizeItems(rakutenItems(response), genreId);
  if (items.length === 0) throw new ProviderError('NO_PRODUCTS', '楽天から対象ジャンルの商品を取得できませんでした。', 400);

  const maxRank = Math.max(...items.map((item) => item.rank));
  const evaluated = items.map((item) => ({
    item,
    evaluation: evaluateRankingProduct(item, filters, weights, maxRank),
  })).filter(({ evaluation }) => evaluation.eligible)
    .sort((left, right) => right.evaluation.score - left.evaluation.score || left.item.rank - right.item.rank);
  if (evaluated.length === 0) throw new ProviderError('NO_ELIGIBLE_PRODUCT', '商品条件を満たす候補がありませんでした。', 400);

  const existing = await service.from('products').select('id, external_item_code')
    .eq('provider', 'rakuten').in('external_item_code', evaluated.map(({ item }) => item.external_item_code));
  if (existing.error) throw new ProviderError('STORAGE_ERROR', '商品履歴を確認できませんでした。', 500);
  const productIds = (existing.data || []).map((row) => row.id);
  const recent = productIds.length > 0
    ? await service.from('post_set_posts').select('product_id').eq('account_id', accountId)
      .in('product_id', productIds).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
    : { data: [], error: null };
  if (recent.error) throw new ProviderError('STORAGE_ERROR', '投稿履歴を確認できませんでした。', 500);
  const recentIds = new Set((recent.data || []).map((row) => row.product_id));
  const existingByCode = new Map((existing.data || []).map((row) => [row.external_item_code, row.id]));
  const selected = evaluated.find(({ item }) => !recentIds.has(existingByCode.get(item.external_item_code))) || evaluated[0];

  const product = await service.from('products').upsert({
    provider: 'rakuten', external_item_code: selected.item.external_item_code, name: selected.item.name,
    item_url: selected.item.item_url, affiliate_url: selected.item.affiliate_url, image_url: selected.item.image_url,
    price: selected.item.price, availability: selected.item.availability, review_count: selected.item.review_count,
    review_average: selected.item.review_average, genre_id: selected.item.genre_id, shop_name: selected.item.shop_name,
    last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: 'provider,external_item_code' }).select('id').single();
  if (product.error || !product.data) throw new ProviderError('STORAGE_ERROR', '選定商品を保存できませんでした。', 500);

  return { ...selected.item, product_id: product.data.id, score: selected.evaluation.score, selected_strategy: selected.evaluation.selected_strategy };
}

async function readFilters(service: Service): Promise<RankingFilters> {
  const result = await service.from('product_filters').select('min_price, max_price, require_in_stock, min_review_count, excluded_words').eq('id', true).maybeSingle();
  if (result.error) throw new ProviderError('STORAGE_ERROR', '商品条件を読み込めませんでした。', 500);
  return result.data || { min_price: 0, max_price: null, require_in_stock: true, min_review_count: 0, excluded_words: [] };
}

async function readWeights(service: Service, accountId: string): Promise<RankingWeights> {
  const [account, global] = await Promise.all([
    service.from('account_strategy_settings').select('ranking_weight, sale_weight, trending_weight').eq('account_id', accountId).maybeSingle(),
    service.from('strategy_settings').select('ranking_weight, sale_weight, trending_weight').eq('id', true).maybeSingle(),
  ]);
  if (account.error || global.error) throw new ProviderError('STORAGE_ERROR', '選定戦略を読み込めませんでした。', 500);
  return account.data || global.data || { ranking_weight: 60, sale_weight: 20, trending_weight: 20 };
}

async function readRakutenCredentials() {
  const row = await withPrivateDb(async (db) => {
    const result = await db.queryObject(`select '\\x' || encode(ciphertext, 'hex') as ciphertext from private.integration_secrets where provider = 'rakuten'`);
    return result.rows[0] as { ciphertext: string } | undefined;
  });
  if (!row) throw new ProviderError('NOT_CONNECTED', '楽天を接続してください。', 400);
  const secret = await decryptSecret(row.ciphertext);
  return {
    applicationId: requiredString(secret.application_id, 'application_id'),
    accessKey: requiredString(secret.access_key, 'access_key'),
    affiliateId: typeof secret.affiliate_id === 'string' ? secret.affiliate_id : '',
  };
}

async function fetchRanking(credentials: { applicationId: string; accessKey: string; affiliateId: string }, genreId: number) {
  const url = new URL('https://openapi.rakuten.co.jp/ichibaranking/api/IchibaItem/Ranking/20220601');
  url.searchParams.set('format', 'json');
  url.searchParams.set('formatVersion', '2');
  url.searchParams.set('applicationId', credentials.applicationId);
  url.searchParams.set('genreId', String(genreId));
  if (credentials.affiliateId) url.searchParams.set('affiliateId', credentials.affiliateId);
  return record(await fetchJson(url, { headers: {
    accessKey: credentials.accessKey,
    Origin: 'https://autoaffiliate-orcin.vercel.app',
    Referer: 'https://autoaffiliate-orcin.vercel.app/',
  } }));
}

function normalizeItems(value: unknown, genreId: number): Candidate[] {
  if (!Array.isArray(value)) throw new ProviderError('INVALID_RESPONSE', '楽天の商品一覧が不正です。');
  return value.map((raw, index) => {
    const item = record(raw);
    return {
      external_item_code: requiredString(item.itemCode, 'itemCode'), name: requiredString(item.itemName, 'itemName'),
      item_url: optionalUrl(item.itemUrl), affiliate_url: optionalUrl(item.affiliateUrl),
      image_url: firstUrl(item.mediumImageUrls) || firstUrl(item.smallImageUrls),
      price: requiredNumber(item.itemPrice, 'itemPrice'),
      availability: item.availability === 1 || item.availability === '1' || item.availability === true,
      review_count: optionalNumber(item.reviewCount) || 0, review_average: optionalNumber(item.reviewAverage),
      genre_id: optionalNumber(item.genreId) || genreId, shop_name: typeof item.shopName === 'string' ? item.shopName : null,
      rank: optionalNumber(item.rank) || index + 1, sale_start_time: normalizeDate(item.startTime),
      sale_end_time: normalizeDate(item.endTime), point_rate: optionalNumber(item.pointRate),
    };
  });
}

function requiredNumber(value: unknown, name: string) {
  const parsed = optionalNumber(value);
  if (parsed === null || parsed < 0) throw new ProviderError('INVALID_RESPONSE', name + ' is invalid.');
  return parsed;
}
function optionalNumber(value: unknown) { const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN; return Number.isFinite(parsed) ? parsed : null; }
function optionalUrl(value: unknown) { if (typeof value !== 'string' || !value) return null; try { const url = new URL(value); return url.protocol === 'https:' ? url.toString() : null; } catch { return null; } }
function firstUrl(value: unknown) { return Array.isArray(value) ? value.map(optionalUrl).find((url): url is string => Boolean(url)) || null : null; }
function normalizeDate(value: unknown) { if (typeof value !== 'string' || !value) return null; const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null; }
