# 手動バックアップ／復元手順

Free Projectでは自動バックアップや長期ログ保持を前提にしない。リリース前、マイグレーション前、または重要な設定変更前に、管理端末で手動バックアップを取得する。

## 事前条件

- Supabase CLIをインストールする。
- Docker互換ランタイムを起動する（ローカル開発時）。
- 本番Projectへ接続する場合は `supabase login` を実行し、Project refを確認する。
- ダンプファイルはGitへ追加せず、暗号化された保管場所へ移す。

## 本番DBのバックアップ

```bash
supabase link --project-ref <project-ref>
supabase db dump --linked --file backup/schema-YYYYMMDD.sql
supabase db dump --linked --data-only --file backup/data-YYYYMMDD.sql
```

AuthユーザーやVaultの秘密情報はこのDBダンプだけで復元できない。管理者アカウント、Secrets、Project設定は別途、Supabase Dashboardの手動確認と安全なパスワード管理庫で管理する。

## ローカル復元確認

```bash
npm run supabase:start
npm run supabase:reset
```

マイグレーションを適用できることを確認し、`supabase status` でローカルサービスが起動していることを確認する。

## 本番復元時の注意

復元は影響範囲を確認してから、メンテナンス時間帯に限定する。先に新しいバックアップを取得し、同じマイグレーションを適用した空の環境でSQLの妥当性を確認する。`private.integration_secrets` の暗号鍵が失われた場合は、暗号文を復元できないため、外部サービスの再接続が必要になる。
