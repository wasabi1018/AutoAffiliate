import { createClient } from "@/lib/supabase/server";

import { PublishingPanel } from "@/app/dashboard/publishing/panel";

export const dynamic = "force-dynamic";

type Account = { id: string; display_name: string; handle: string; status: string };
type PostSet = { id: string; account_id: string; status: string; approval_status: "pending" | "approved" | "rejected"; created_at: string };

export default async function PublishingPage() {
  const supabase = await createClient();
  const [accountsResult, setsResult] = await Promise.all([
    supabase.from("threads_accounts").select("id, display_name, handle, status").order("created_at", { ascending: true }),
    supabase.from("post_sets").select("id, account_id, status, approval_status, created_at").order("created_at", { ascending: false }).limit(20),
  ]);

  return (
    <main className="container main publishing-page">
      <div className="eyebrow">Phase 6 - Publishing</div>
      <h1>Approved Threads posts</h1>
      <p className="lede">Create a parent post and optional reply, review it, and approve it. Live publishing is blocked until every safety gate is explicitly enabled.</p>
      {accountsResult.error || setsResult.error ? <p className="error" role="alert">Publishing data could not be loaded. Apply the Phase 6 migration and reload.</p> : null}
      <PublishingPanel accounts={(accountsResult.data || []) as Account[]} initialSets={(setsResult.data || []) as PostSet[]} />
    </main>
  );
}
