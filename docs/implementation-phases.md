# Threads × 楽天アフィリエイト自動運用システム 実装フェーズ

更新日: 2026-09-06  
状態: 実装前の計画書（この文書作成時点では未実装）

## 1. 方針と前提

本システムは、複数のThreadsアカウントをジャンル別に管理し、楽天市場の商品情報を利用して、親投稿と自分の投稿への返信を計画・生成・投稿・分析する個人運用向けWebシステムとする。

- SaaS化は行わない。
- 利用者は1名の管理者のみとし、一般ユーザー登録、テナント、課金、チーム、招待、顧客管理は実装しない。
- Harmony PaletteとはSupabase Organization／Projectを分離し、データ、認証、利用量、シークレットを混在させない。
- 専用VPSは持たず、Next.jsの管理画面とSupabaseを組み合わせる。
- 1日に複数回の投稿はVercel Cronではなく、Supabase CronとEdge Functionsで実行する。
- 初期段階では自動投稿を無効にし、Dry Runと手動承認から安全に段階移行する。

## 2. 採用構成

### 管理画面

- Next.js、TypeScript
- Vercel Hobbyは管理画面の配信にのみ使用
- Vercel Cronは使用しない
- 原則としてServer Componentsで読み取り、Server Actionsで管理画面内の更新、Route Handlersで外部コールバックを扱う

### バックエンド

- Supabase Auth: 管理者認証
- Supabase Postgres: 設定、商品、投稿、ジョブ、分析データ
- Row Level Security（RLS）: ブラウザから到達できるテーブルの保護
- Supabase Cron: 1分ごとのディスパッチ
- Supabase Edge Functions: 楽天API、Threads API、投稿処理、Insights取得
- Supabase Vault／Edge Function Secrets: API資格情報と暗号鍵

### 開発・運用環境

- ローカル開発: Supabase CLI + Docker
- 本番: Auto Affiliater専用のHosted Supabase Projectを1つ使用
- 無料枠のActive Project数を考慮し、本番とは別のHosted Stagingは当面作らない
- 本番反映前はローカル環境でマイグレーションとテストを完了させる

## 3. 責務分離

処理の基本フローは次の通りとする。

```text
Supabase Cron（毎分）
  -> Dispatcher Edge Function
     -> 実行期限を迎えたジョブをDB上で排他的に取得
        -> 楽天APIから候補取得
        -> 選定・文章生成・安全確認
        -> Dry RunまたはThreads投稿
        -> 結果と再試行状態をDBへ保存
```

現在のアカウント別ジャンル自動投稿と段階的な運用モードは、`docs/account-genre-automation.md`を正本とする。

- Cronはアカウントごとに増やさず、ディスパッチ用の1ジョブに集約する。
- Edge Functionは短時間の外部API処理に限定する。
- 集計や履歴計算などDB内で完結する処理はPostgres側へ寄せる。
- 同じジョブが重複起動しても二重投稿にならない冪等性を必須とする。

## 4. セキュリティ方針

- 公開サインアップを無効にし、管理者アカウントを手動作成する。
- 管理者1名でもRLSを省略しない。
- 公開スキーマのテーブル、ビュー、関数には必要最小限の権限を明示する。
- ブラウザへ渡すのはSupabaseのPublishable Keyのみとする。
- `service_role`、Meta App Secret、楽天Access Key、暗号鍵をブラウザへ渡さない。
- 楽天Application ID、Access Key、Affiliate ID、Meta App Secret、暗号鍵はEdge Function SecretsまたはVaultで管理する。
- Threadsアカウントごとの更新可能トークンは暗号化し、ブラウザから直接参照できない`private`スキーマに保存する。
- トークンの失効、期限切れ、再接続要求を管理画面に表示する。
- 本番投稿は環境、機能フラグ、アカウント状態の複数条件が揃った場合だけ許可する。

## 5. 外部サービス上の制約

### Threads

- 親投稿と、`reply_to_id`を指定した自分の投稿への返信を利用する。
- 投稿数上限は固定値だけに依存せず、利用状況確認APIを使って動的に確認する。
- 投稿単位の公式Insightsは、views、likes、replies、reposts、quotes、shares等を対象とする。
- Threads Insightsだけではリンククリック数を取得できないため、クリック数やCTRを推測しない。
- 投稿成功後にレスポンスを失った場合を想定し、即時再投稿せず照合可能な状態へ移す。

### 楽天

- 現行APIで必要となるApplication IDとAccess Keyを利用する。
- Affiliate IDを指定して返却される正規のアフィリエイトURLを使用する。
- 楽天のリンクを独自リダイレクト、短縮URL、改変URLに置き換えない。
- `originalPrice`や`discountRate`は根拠がある場合だけ保存・表示し、現在価格から推定しない。
- SALE判定はAPIの公式項目（価格、セール期間、ポイント倍率、キャッチコピー等）に限定する。
- クーポンや割引率をAPIの根拠なしに生成しない。

### 表示・運用ルール

- 広告であることが分かるPR表記を投稿に含める。
- 楽天側へ登録した公開Threadsアカウントのみを使用する。
- 他人の投稿への返信にアフィリエイトリンクを投稿しない。
- 自分の親投稿への返信にリンクを置く運用は、本番開始前に最新規約へ適合することを再確認する。
- スパムと判断される頻度、重複文面、無関係な大量投稿を避ける。

## 6. 実装フェーズ

### Phase 0: 仕様・規約・設計の確定

目的: 実装可能範囲、条件付き機能、採用構成をコード着手前に確定する。

実施内容:

- 既存リポジトリとコードの有無を確認する。
- システム構成、ディレクトリ構成、DBのER設計を作成する。
- PostSetとジョブの状態遷移を設計する。
- 楽天APIとThreads APIの機能・制約マトリクスを作成する。
- RANKING、SALE、TRENDINGの判定根拠を定義する。
- 親投稿、返信、Insights、分析、AI提案のデータフローを確定する。
- PR表記、リンクの扱い、禁止事項、投稿上限を確認する。
- ローカル／本番構成、無料枠の制約、MVPの受入条件を確定する。

完了条件:

- 必要な外部サービス資格情報の種類が特定されている。
- 実現不可または条件付きの項目が文書化されている。
- 独自クリックリダイレクトを採用しないことが確定している。
- 本番自動投稿は初期状態で無効とする設計になっている。

### Phase 1: プロジェクト基盤

目的: 認証、DB、開発環境、品質確認の土台を構築する。

実施内容:

- Git、Next.js、TypeScriptプロジェクトを初期化する。
- Supabase CLIとDockerによるローカル環境を構築する。
- 本番Supabase Projectへのリンク手順を整備する。
- DBマイグレーション方式を決定する。
- `public`／`private`スキーマを分離する。
- Supabase Authで管理者1名を設定し、公開サインアップを無効化する。
- RLS、明示的な権限付与、必要に応じた`security_invoker`ビューを定義する。
- 管理画面の基本レイアウト、環境変数検証、エラーハンドリングを用意する。
- lint、typecheck、test、production buildをCIで実行する。
- 無料プラン向けの手動バックアップ／復元手順を作る。

注意事項:

- Supabaseの公開スキーマに対する自動API公開・権限の現行仕様を、実装時点のBreaking Changesで再確認する。
- テーブル作成時にRLSと権限設定を同じマイグレーションへ含める。

完了条件:

- ローカルDBをマイグレーションだけで再構築できる。
- 未認証または権限外アクセスが拒否される。
- Preview環境から本番投稿を実行できない。
- typecheck、lint、test、production buildが成功する。

### Phase 2: 運用設定と管理UI

目的: 投稿前に必要な運用設定を安全に管理できるようにする。

実施内容:

- Threadsアカウントの表示名、ジャンル、状態を管理する。
- ジャンル変更履歴を保持し、分析期間と矛盾しないようにする。
- 戦略の重みと変更履歴を管理する。
- 価格帯、除外語、在庫、レビュー数などの商品フィルターを設定する。
- Hook／Replyテンプレートを管理する。
- テンプレート変数の許可リストと検証を実装する。
- アカウント別の投稿曜日、投稿時刻、タイムゾーンを管理する。
- 投稿プレビューを提供する。
- アカウント別停止、全体停止、緊急停止、自動投稿切替を用意する。

完了条件:

- 不正な時刻、重複設定、未定義変数を保存できない。
- 停止中のアカウントにはジョブが作られない。
- 設定変更履歴を追跡できる。

### Phase 3: Threads／楽天接続（投稿なし）

目的: 外部サービスとの接続と資格情報管理を、投稿を行わずに検証する。

実施内容:

- Social Provider、Product Provider、Affiliate Providerの境界を定義する。
- Threads OAuth、プロフィール取得、長期トークン更新、再接続を実装する。
- Threadsの投稿利用状況／上限を取得する。
- 楽天のApplication ID、Access Key、Affiliate IDを設定する。
- 楽天ジャンル、ランキング、商品情報の取得を検証する。
- 外部APIレスポンスのスキーマ検証、タイムアウト、エラー分類を実装する。

完了条件:

- 最低1つのThreadsアカウントと楽天APIの接続確認ができる。
- トークンや秘密情報がブラウザ、ログ、エラー画面に露出しない。
- このフェーズではThreadsへの投稿が発生しない。

### Phase 4: RANKING商品選定（Dry Run）

目的: 根拠を記録できる商品選定を、投稿せずに完成させる。

実施内容:

- `products`、`product_snapshots`、`ranking_history`等の商品履歴を設計する。
- 楽天ランキングの取得、正規化、保存を行う。
- フィルター、クールダウン、重複排除を適用する。
- 商品スコアと選定理由を保存する。
- 投稿候補と生成文をDry Runとして管理画面に表示する。
- 後のTRENDING判定に必要な順位履歴の収集を開始する。

完了条件:

- 同じ入力から再現可能な選定結果を得られる。
- 選定／除外理由を管理画面とログで確認できる。
- 値引率、元値、クーポン等を推測していない。
- Threadsへの投稿は発生しない。

### Phase 5: Cron・ジョブ・安全装置（Dry Run）

目的: 複数回投稿を支えるスケジューラを、外部投稿なしで検証する。

実施内容:

- `posting_jobs`、`post_sets`、`post_attempts`を設計する。
- Supabase CronからDispatcher Edge Functionを毎分呼び出す。
- `FOR UPDATE SKIP LOCKED`等で期限到来ジョブを排他的に取得する。
- ジョブキーと投稿キーによる冪等性を実装する。
- 実行漏れの回収、指数バックオフ、最大再試行、Dead Letter状態を実装する。
- アカウント別の日次上限、最短投稿間隔、Threads利用上限を確認する。
- アカウント停止、全体停止、緊急停止をジョブ実行側でも強制する。
- ログと商品履歴の保持／集約／削除方針を実装する。

完了条件:

- CronやFunctionが重複起動しても同一ジョブを二重処理しない。
- 停止中、上限到達時、資格情報異常時に投稿処理へ進まない。
- 失敗したジョブを安全に再実行または手動復旧できる。
- Dry Runのまま複数アカウント・複数回スケジュールを検証できる。

### Phase 6: Threads本番投稿（技術MVP）

目的: 親投稿と自分の投稿への返信を、安全に本番投稿できるようにする。

実施内容:

- 親投稿コンテナ作成、公開、投稿ID保存を実装する。
- 親投稿IDを`reply_to_id`へ指定した返信の作成、公開、ID保存を実装する。
- PostSetの状態遷移を実装する。
- 親投稿成功・返信失敗を`PARTIAL_FAILURE`として扱う。
- 親投稿を再投稿せず、返信だけを再試行できるようにする。
- タイムアウト等で結果が曖昧な場合の照合フローを用意する。
- 手動承認とLive／Dry Runの機能ゲートを実装する。
- 操作監査ログを保存する。

段階リリース:

1. 1アカウント、1日1 PostSet、毎回手動承認
2. 同じアカウントで1日複数回、毎回手動承認
3. 複数アカウント、毎回手動承認
4. 安定性確認後にアカウント単位で自動投稿を有効化

完了条件:

- 同一PostSetの二重投稿が発生しない。
- 親投稿のみ成功した場合に返信だけを復旧できる。
- 投稿ID、時刻、内容、使用商品、試行履歴を追跡できる。
- 緊急停止が新規投稿を確実に止める。

ここまでを「技術MVP」とする。

### Phase 7: Insightsと基本分析（運用MVP）

目的: 投稿結果を収集し、運用判断に使える基本画面を提供する。

実施内容:

- 投稿後1時間、6時間、24時間、72時間等のInsights取得ジョブを作成する。
- 公式APIから取得できる指標だけをスナップショット保存する。
- アカウント、ジャンル、戦略、Hook、曜日、時間帯別に集計する。
- 投稿詳細と期間比較ダッシュボードを作成する。
- クリック数／CTRは「未取得」と明示し、0として扱わない。

完了条件:

- 過去時点を含むInsights推移を確認できる。
- 取得不能と実績0を区別できる。
- 投稿、商品、戦略、テンプレート、Insightsを追跡可能である。

ここまでを「運用MVP」とする。

### Phase 8: SALE／TRENDING戦略

目的: RANKING以外の選定戦略を、根拠付きで追加する。

実施内容:

- API上の根拠があるSALE候補だけを抽出する。
- 順位履歴の差分、継続性、急上昇率を用いてTRENDINGを判定する。
- ノイズの多い単発変動を除外する。
- RANKING、SALE、TRENDINGのスコアを正規化する。
- アカウント別の戦略配分と重み付き選定を実装する。
- 戦略ごとの分析画面を拡張する。

完了条件:

- SALE／TRENDING判定の根拠を説明できる。
- 履歴不足時はTRENDINGを無理に判定しない。
- 戦略の重みを変更しても過去実績の解釈が壊れない。

### Phase 9: AI SUGGEST

目的: 蓄積データを基に、運用改善案を人間へ提示する。

実施内容:

- 個人情報や秘密情報を除いた集計データをAI入力にする。
- 戦略重み、投稿時間、テンプレート傾向等の提案を生成する。
- 提案には根拠、対象期間、分析ID、モデル、推定コストを保存する。
- 適用前後の値と理由を監査可能にする。
- 提案は人間が承認した場合だけ、許容範囲内で反映する。

完了条件:

- AIがコード、RLS、資格情報、停止設定を変更できない。
- 提案の自動適用を初期状態で無効にする。
- データ不足時は提案を出さず、その理由を表示する。
- 投稿ごとのAI文章生成は初期スコープに含めない。

## 7. 無料枠を維持するための設計

- Cronは毎分1回のDispatcherに集約する。
- 1分間隔を31日動かすと約44,640回であり、小規模運用ではEdge Function無料枠内に収まりやすい。ただし実装前に最新クォータを再確認する。
- 1回のDispatcherで処理するPostSet数を1〜3件程度に制限し、外部API待機やCPU超過を防ぐ。
- Edge Functionの現行無料枠上限（wall-clock、CPU、メモリ等）を実装時に再確認する。
- 生のランキング履歴は目安90日間保持し、それ以前は日次集計へ縮約する。
- 外部APIレスポンス全文を重複保存せず、再現・監査に必要な項目だけを保存する。
- ジョブログと監査ログに保持期限を設ける。
- DB使用量を管理画面または定期ジョブで監視する。
- Free Projectには本番向けの自動バックアップや長期ログ保持が不足する可能性があるため、本番マイグレーション前に手動バックアップを取得する。
- Free Projectの一時停止条件やSLAの有無を理解し、完全無停止を前提にしない。

## 8. 各フェーズ共通の完了ルール

各フェーズでは、機能実装だけでなく次を完了条件に含める。

- 対象フェーズ外の機能を先行実装しない。
- typecheck、lint、テスト、production buildを成功させる。
- DBマイグレーションからローカル環境を再構築できることを確認する。
- Edge Functionsは外部APIのfixtureを使った単体／契約テストを行う。
- 自動テストから実際のThreads投稿や本番楽天APIへの不要なアクセスを行わない。
- RLS、権限、秘密情報、ログ出力をセキュリティ観点で確認する。
- 実装内容、変更ファイル、実行テスト、確認済みAPI制約、残課題、次フェーズを報告する。

## 9. 初期スコープ外

- SaaS化、マルチテナント、一般ユーザー登録
- 課金、サブスクリプション、契約プラン
- チーム、ロール、招待、顧客向け管理画面
- 規約に反するスクレイピング
- 根拠のない価格、割引率、クーポン、在庫情報の生成
- 独自リダイレクトや第三者短縮URLによるクリック計測
- AIによるコード、DB権限、セキュリティ設定の変更

## 10. 将来の任意拡張

次はMVPおよび初期運用の安定後に別途判断する。

- AI提案の限定的な自動適用
- 楽天レポートCSVの手動または半自動取り込み
- 売上、注文件数、成果報酬の分析
- 他ASPへの対応
- Threads以外のSNS対応

## 11. 実装開始順

実装はPhase 0から順に進め、各フェーズの完了条件を満たしてから次へ進む。

- Phase 0〜5: 投稿しない状態で設計、接続、選定、スケジューラを固める
- Phase 6: 技術MVP（安全なRANKING投稿）
- Phase 7: 運用MVP（Insightsと基本分析）
- Phase 8〜9: 選定高度化とAI支援

## 12. 実装前に再確認する公式情報

API、無料枠、規約は変更されるため、各該当フェーズの開始時点で公式情報を再確認する。

- [Supabase: Schedule Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions)
- [Supabase: Edge Function Limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase: Billing and usage](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase: Breaking Changes](https://supabase.com/changelog?types=breaking-change)
- [Meta: Threads API official collection](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api)
- [Meta: Threads post insights](https://www.postman.com/meta/threads/request/434u2bd/get-post-insights)
- [Rakuten Web Service: Ichiba Item Ranking API](https://webservice.rakuten.co.jp/documentation/ichiba-item-ranking)
- [Rakuten Web Service: Ichiba Item Search API](https://webservice.rakuten.co.jp/documentation/ichiba-item-search)
- [楽天アフィリエイト ガイドライン](https://affiliate.rakuten.co.jp/guideline/rule/)
- [楽天アフィリエイト レポートガイド](https://affiliate.rakuten.co.jp/guides/report/)
