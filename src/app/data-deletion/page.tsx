import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "データ削除手順 | Auto Affiliater",
  description: "Auto Affiliaterに保存された利用者データの削除依頼方法を説明します。",
};

export default function DataDeletionPage() {
  return (
    <LegalPage
      eyebrow="DATA DELETION"
      title="利用者データの削除手順"
      updatedAt="2026年9月9日"
    >
      <p>
        Auto Affiliaterに保存されたアカウント情報およびThreads連携データの削除を
        希望する場合は、以下の手順でご依頼ください。
      </p>

      <section>
        <h2>削除依頼の手順</h2>
        <ol>
          <li>
            登録時または連絡可能なメールアドレスから
            <a href="mailto:wasabiworks.contact@gmail.com?subject=Auto%20Affiliater%20%E3%83%87%E3%83%BC%E3%82%BF%E5%89%8A%E9%99%A4%E4%BE%9D%E9%A0%BC">
              wasabiworks.contact@gmail.com
            </a>
            宛にメールを送信してください。
          </li>
          <li>
            件名を「Auto Affiliater データ削除依頼」としてください。
          </li>
          <li>
            本文に、ログインに使用したメールアドレスと連携したThreadsユーザー名を
            記載してください。パスワードやアクセストークンは記載しないでください。
          </li>
        </ol>
      </section>

      <section>
        <h2>削除するデータ</h2>
        <ul>
          <li>アカウントプロフィールおよび認証に関連する情報</li>
          <li>Threadsのアクセストークン、アカウントIDおよび連携設定</li>
          <li>作成済み・予約済みの投稿、投稿結果および関連ログ</li>
          <li>商品、アフィリエイト、分析および本サービス内の設定情報</li>
        </ul>
      </section>

      <section>
        <h2>処理期間</h2>
        <p>
          なりすまし防止のため本人確認をお願いする場合があります。確認完了後、
          通常30日以内に対象データを削除または復元できない形で匿名化し、
          完了した旨をメールでお知らせします。法令上の保存義務がある情報は、
          必要な期間に限り保存する場合があります。
        </p>
      </section>

      <section>
        <h2>Threads側のアクセス解除</h2>
        <p>
          Metaの設定から本サービスとの連携を解除すると、今後のAPIアクセスを停止できます。
          連携解除だけでは本サービス内の既存データが自動削除されない場合があるため、
          完全な削除を希望する場合は上記のメール依頼も行ってください。
        </p>
      </section>

      <section>
        <h2>お問い合わせ</h2>
        <p>
          削除手続きに関するご質問は、
          <a href="mailto:wasabiworks.contact@gmail.com">
            wasabiworks.contact@gmail.com
          </a>
          までご連絡ください。
        </p>
      </section>
    </LegalPage>
  );
}