import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "プライバシーポリシー | Auto Affiliater",
  description: "Auto Affiliaterにおける利用者情報の取り扱いについて説明します。",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="PRIVACY POLICY"
      title="プライバシーポリシー"
      updatedAt="2026年9月9日"
    >
      <p>
        Auto Affiliater（以下「本サービス」）は、利用者の情報を適切に取り扱い、
        安全なサービス運営に努めます。本ポリシーでは、収集する情報、利用目的、
        外部サービスへの提供および削除方法を説明します。
      </p>

      <section>
        <h2>1. 収集する情報</h2>
        <ul>
          <li>ログインに使用するメールアドレス、認証情報およびセッション情報</li>
          <li>
            連携したThreadsアカウントのID、ユーザー名、表示名、アクセストークンおよび有効期限
          </li>
          <li>作成・予約・投稿した文章、投稿日時、投稿結果およびエラー情報</li>
          <li>
            楽天アフィリエイト等の連携設定、商品情報、リンクおよび成果集計に必要な情報
          </li>
          <li>本サービス内の設定、操作履歴、アクセス日時等の運用ログ</li>
        </ul>
      </section>

      <section>
        <h2>2. 利用目的</h2>
        <ul>
          <li>アカウント認証、Threads連携、投稿および予約投稿の実行</li>
          <li>アフィリエイト投稿の作成支援、成果表示およびサービス提供</li>
          <li>障害調査、不正利用防止、セキュリティ確保および品質改善</li>
          <li>重要なお知らせや問い合わせへの対応</li>
        </ul>
      </section>

      <section>
        <h2>3. 外部サービスの利用</h2>
        <p>
          本サービスは、機能提供のためMeta Platforms, Inc.のThreads API、
          楽天グループの関連API、SupabaseおよびVercelを利用します。必要な範囲で
          情報が各事業者に送信され、それぞれの規約とプライバシーポリシーに基づいて
          処理される場合があります。
        </p>
      </section>

      <section>
        <h2>4. 安全管理</h2>
        <p>
          アクセストークン等の機密情報は、アクセス制御された環境で保管し、
          通信の暗号化、権限管理およびログ監視など合理的な安全管理措置を講じます。
        </p>
      </section>

      <section>
        <h2>5. 保存期間とデータ削除</h2>
        <p>
          情報は利用目的の達成に必要な期間保存します。利用者は
          <Link href="/data-deletion">データ削除手順</Link>
          に従って、アカウントおよび関連データの削除を依頼できます。
        </p>
      </section>

      <section>
        <h2>6. 第三者提供</h2>
        <p>
          本人の同意がある場合、サービス提供に必要な委託先に提供する場合、
          または法令に基づく場合を除き、個人情報を第三者へ販売・提供しません。
        </p>
      </section>

      <section>
        <h2>7. 本ポリシーの変更</h2>
        <p>
          法令やサービス内容の変更に応じて本ポリシーを改定することがあります。
          重要な変更は本サービス上でお知らせします。
        </p>
      </section>

      <section>
        <h2>8. お問い合わせ</h2>
        <p>
          本ポリシーや利用者情報に関するお問い合わせは、
          <a href="mailto:wasabiworks.contact@gmail.com">
            wasabiworks.contact@gmail.com
          </a>
          までご連絡ください。
        </p>
      </section>
    </LegalPage>
  );
}