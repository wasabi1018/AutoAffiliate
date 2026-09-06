# Phase 7: Insightsと基本分析

Phase 7は、公開済みThreads投稿の公式Insightsを1時間、6時間、24時間、72時間の窓で取得し、過去時点を含むスナップショットとして保存します。取得ジョブは投稿ごと・窓ごとに一意で、失敗時は指数バックオフ後に最大3回まで再試行します。

## Deploy

Phase 7のマイグレーション適用後、CollectorをJWT検証なしでデプロイします。Collectorは `INSIGHTS_CRON_SECRET` と `x-insights-secret` の一致をコード側で検証します。

```bash
supabase functions deploy insights-collector --no-verify-jwt
```

管理画面から手動実行する場合は、通常の管理者JWTでも実行できます。

## Supabase Cron

プロジェクト固有のURLとSecretをSQLへ直書きしないため、Vaultへ保存してから15分間隔のCronを登録します。

```sql
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<same value as INSIGHTS_CRON_SECRET>', 'insights_cron_secret');

select cron.schedule(
  'auto-affiliater-insights',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/insights-collector',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-insights-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'insights_cron_secret')
    ),
    body := '{"source":"pg_cron"}'::jsonb
  );
  $$
);
```

不要になった場合は `select cron.unschedule('auto-affiliater-insights');` で解除できます。

## Metrics policy

保存対象はThreads APIが返す `views`、`likes`、`replies`、`reposts`、`quotes`、`shares` のみです。クリック数とCTRは取得できないため、0へ補正せずNULL（画面上は「未取得」）として扱います。APIレスポンスが一部または全て欠落した場合も、`metrics_status` で「一部取得」「取得不能」を区別します。

管理画面は `/dashboard/analytics` で、直近7日と前7日の比較、アカウント・ジャンル・戦略・Hook・曜日・時間帯別の集計、投稿ごとの履歴を確認できます。商品・戦略・Hook・テンプレートの追跡ID/ラベルは投稿セットの投稿行に保存できます。
