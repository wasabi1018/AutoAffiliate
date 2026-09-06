import { adminClient, ProviderError } from './http.ts';
import { selectAutomaticProduct } from './automatic-product.ts';

type Service = ReturnType<typeof adminClient>;
export type AutomationAccount = {
  id: string;
  display_name: string;
  genre: string;
  genre_id: number | null;
  operation_mode: 'semi_auto' | 'auto';
  preferred_hook_template_id: string | null;
};

export async function prepareAutomaticPost(service: Service, postSetId: string, account: AutomationAccount) {
  const existing = await service.from('post_set_posts').select('id').eq('post_set_id', postSetId).limit(1);
  if (existing.error) throw new ProviderError('STORAGE_ERROR', '投稿内容を確認できませんでした。', 500);
  if ((existing.data || []).length > 0) return;
  if (!account.genre_id) throw new ProviderError('GENRE_NOT_CONFIGURED', 'アカウントの楽天ジャンルを設定してください。', 400);

  const product = await selectAutomaticProduct(service, account.id, account.genre_id);
  const templates = await service.from('post_templates').select('id, template_type, body, active')
    .eq('active', true).order('created_at', { ascending: true });
  if (templates.error) throw new ProviderError('STORAGE_ERROR', '投稿テンプレートを読み込めませんでした。', 500);
  const hookTemplate = (templates.data || []).find((row) => row.id === account.preferred_hook_template_id)
    || (templates.data || []).find((row) => row.template_type === 'hook');
  const replyTemplate = (templates.data || []).find((row) => row.template_type === 'reply');
  const values = {
    product_name: product.name,
    price: `${Math.round(product.price).toLocaleString('ja-JP')}円`,
    affiliate_url: product.affiliate_url || product.item_url || '',
    genre: account.genre,
    display_name: account.display_name,
    pr: 'PR',
  };
  const parentText = fitPost(hookTemplate?.body
    ? renderTemplate(hookTemplate.body, values)
    : `【${account.genre}のおすすめ】\n${product.name}\n${values.price}\n\n気になる方は返信のリンクからチェック。\nPR`);
  const replyText = values.affiliate_url
    ? fitPost(replyTemplate?.body ? renderTemplate(replyTemplate.body, values) : `商品はこちら\n${values.affiliate_url}\nPR`)
    : null;

  const rows = [{
    post_set_id: postSetId, account_id: account.id, position: 0, kind: 'parent', text: parentText,
    idempotency_key: `${postSetId}:parent`, product_id: product.product_id,
    strategy: product.selected_strategy, hook: account.genre, template_id: hookTemplate?.id || null,
  }];
  if (replyText) rows.push({
    post_set_id: postSetId, account_id: account.id, position: 1, kind: 'reply', text: replyText,
    idempotency_key: `${postSetId}:reply:1`, product_id: product.product_id,
    strategy: product.selected_strategy, hook: account.genre, template_id: replyTemplate?.id || null,
  });
  const inserted = await service.from('post_set_posts').insert(rows);
  if (inserted.error) throw new ProviderError('STORAGE_ERROR', '自動生成した投稿を保存できませんでした。', 500);
  const updated = await service.from('post_sets').update({ content_payload: {
    source: 'account_genre_automation', operation_mode: account.operation_mode,
    genre: account.genre, genre_id: account.genre_id, product_id: product.product_id,
    score: product.score, strategy: product.selected_strategy,
  }, updated_at: new Date().toISOString() }).eq('id', postSetId);
  if (updated.error) throw new ProviderError('STORAGE_ERROR', '投稿セットを更新できませんでした。', 500);
}

export function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_match, key: string) => values[key] ?? '');
}

function fitPost(value: string) {
  const text = value.trim();
  if (!text) throw new ProviderError('EMPTY_POST', '生成した投稿文が空です。', 400);
  return text.length <= 500 ? text : `${text.slice(0, 497)}...`;
}
