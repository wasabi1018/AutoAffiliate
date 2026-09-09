import type { Metadata } from "next";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "利用規約 | Auto Affiliater",
  description: "Auto Affiliaterの利用条件について説明します。",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="TERMS OF SERVICE"
      title="利用規約"
      updatedAt="2026年9月9日"
    >
      <p>
        本利用規約（以下「本規約」）は、Auto Affiliater（以下「本サービス」）の
        利用条件を定めるものです。利用者は、本規約に同意のうえ本サービスを利用するものとします。
      </p>

      <section>
        <h2>1. サービス内容</h2>
        <p>
          本サービスは、Threadsへの投稿作成・予約投稿、商品情報やアフィリエイトリンクを
          利用した投稿作成支援、投稿結果の管理等の機能を提供します。
        </p>
      </section>

      <section>
        <h2>2. アカウント管理</h2>
        <p>
          利用者は、登録情報および連携アカウントを正確かつ安全に管理し、
          第三者による不正利用を防止する責任を負います。不正利用を発見した場合は
          速やかにお問い合わせください。
        </p>
      </section>

      <section>
        <h2>3. 投稿内容と表示</h2>
        <p>
          投稿内容、商品情報、広告表現およびアフィリエイトであることの表示は、
          利用者自身の責任で確認してください。利用者は、関係法令、Threadsその他の
          外部サービスの規約、および広告・景品表示に関するルールを遵守するものとします。
        </p>
      </section>

      <section>
        <h2>4. 禁止事項</h2>
        <ul>
          <li>法令、公序良俗または第三者の権利を侵害する行為</li>
          <li>虚偽、誤認を招く内容、スパムその他外部サービスの規約に反する投稿</li>
          <li>本サービスへの不正アクセス、解析、妨害または過度な負荷を与える行為</li>
          <li>認証情報や利用権限を第三者へ不正に譲渡・貸与する行為</li>
          <li>その他、本サービスの運営者が不適切と判断する行為</li>
        </ul>
      </section>

      <section>
        <h2>5. サービスの変更・停止</h2>
        <p>
          保守、障害、外部APIの仕様変更その他必要な場合、本サービスの全部または一部を
          変更・停止することがあります。可能な範囲で事前または事後にお知らせします。
        </p>
      </section>

      <section>
        <h2>6. 免責事項</h2>
        <p>
          本サービスは投稿の到達、審査通過、売上または成果を保証しません。外部サービスの
          障害・制限、利用者の入力内容その他本サービスの合理的な管理を超える事由により
          生じた損害について、法令上認められる範囲で責任を負いません。
        </p>
      </section>

      <section>
        <h2>7. 利用停止</h2>
        <p>
          本規約への違反、不正利用またはセキュリティ上の危険が認められる場合、
          事前の通知なく利用を制限または停止することがあります。
        </p>
      </section>

      <section>
        <h2>8. 規約の変更</h2>
        <p>
          法令やサービス内容の変更に応じて本規約を改定することがあります。
          重要な変更は本サービス上でお知らせします。
        </p>
      </section>

      <section>
        <h2>9. 準拠法・管轄</h2>
        <p>
          本規約は日本法に準拠します。本サービスに関する紛争は、
          日本の法令に従い管轄裁判所を定めます。
        </p>
      </section>

      <section>
        <h2>10. お問い合わせ</h2>
        <p>
          本規約に関するお問い合わせは、
          <a href="mailto:wasabiworks.contact@gmail.com">
            wasabiworks.contact@gmail.com
          </a>
          までご連絡ください。
        </p>
      </section>
    </LegalPage>
  );
}