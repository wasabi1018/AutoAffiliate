import { createClient } from "@/lib/supabase/server";

import { PublishingPanel } from "@/app/dashboard/publishing/panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "投稿管理" };

type Account = { id: string; display_name: string; handle: string; status: string };
type PostItem = { id: string; kind: 'parent' | 'reply'; text: string; status: string; products: { name: string; item_url: string | null; affiliate_url: string | null; price: number } | null };
type PostSet = { id: string; account_id: string; status: string; approval_status: 'pending' | 'approved' | 'rejected'; content_payload: Record<string, unknown>; created_at: string; post_set_posts: PostItem[] };

export default async function PublishingPage() {
  const supabase = await createClient();
  const [accountsResult, setsResult] = await Promise.all([
    supabase.from("threads_accounts").select("id, display_name, handle, status").order("created_at", { ascending: true }),
    supabase.from('post_sets').select('id, account_id, status, approval_status, content_payload, created_at, post_set_posts(id, kind, text, status, products(name, item_url, affiliate_url, price))').order('created_at', { ascending: false }).limit(20),
  ]);

  return (
    <main className="dashboard-main publishing-page">
      <div className="eyebrow">運用</div>
      <h1>投稿管理</h1>
      <p className="lede">投稿文を作成し、内容を確認してから承認・公開します。</p>
      {accountsResult.error || setsResult.error ? <p className="error notice" role="alert">投稿データを読み込めませんでした。しばらくしてから再読み込みしてください。</p> : null}
      <PublishingPanel accounts={(accountsResult.data || []) as Account[]} initialSets={(setsResult.data || []) as unknown as PostSet[]} />
    </main>
  );
}
