# Auto Affiliater

Threads × 楽天アフィリエイト自動運用システム。管理者1名向けのNext.js + Supabaseアプリです。

## Phase 1

- Next.js App Router + TypeScript
- Supabase Auth（公開サインアップ無効、管理者ログインのみ）
- `public` と `private` スキーマの分離
- publicテーブルのRLSと明示的な権限付与
- ブラウザにはSupabase URLとPublishable Keyだけを公開
- Dry Runを初期値とした基本管理画面
- lint / typecheck / test / production buildのCI

## セットアップ

```bash
npm install
Copy-Item .env.example .env.local
```

`.env.local` にローカルSupabaseのURLとPublishable Keyを設定する。本番の秘密鍵や `service_role` キーを `NEXT_PUBLIC_` 変数へ設定してはいけない。

Supabase CLIとDocker互換ランタイムを用意した後、次を実行する。

```bash
npm run supabase:start
npm run supabase:status
npm run dev
```

ローカル管理者はSupabase StudioまたはCLIで作成し、そのUUIDを特権SQLセッションから `public.admin_users` へ登録する。認証情報や外部サービス秘密情報はseedへ保存しない。

## 品質確認

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Dockerが使えない環境ではSupabaseのローカルDBを起動できないため、CIまたはDocker利用可能な端末で `npm run supabase:reset` を実行してマイグレーションからの再構築を確認する。

バックアップと復元は [docs/backup-restore.md](docs/backup-restore.md) を参照する。
