import { createClient } from "@/lib/supabase/server";

import { JobsPanel } from "@/app/dashboard/jobs/panel";

export const dynamic = "force-dynamic";
export const metadata = { title: "実行履歴" };

type Job = {
  id: string;
  account_id: string;
  job_key: string;
  scheduled_for: string;
  status: "queued" | "running" | "dry_run" | "succeeded" | "failed" | "cancelled" | "dead_letter";
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string;
  finished_at: string | null;
  last_error_code: string | null;
};

export default async function JobsPage() {
  const supabase = await createClient();
  const result = await supabase
    .from("posting_jobs")
    .select("id, account_id, job_key, scheduled_for, status, attempt_count, max_attempts, next_attempt_at, finished_at, last_error_code")
    .order("scheduled_for", { ascending: false })
    .limit(50);

  return (
    <main className="dashboard-main jobs-page">
      <div className="eyebrow">運用</div>
      <h1>実行履歴</h1>
      <p className="lede">予約された処理の状態と、失敗した処理の再試行状況を確認します。</p>
      {result.error ? <p className="error notice" role="alert">実行履歴を読み込めませんでした。しばらくしてから再読み込みしてください。</p> : null}
      <JobsPanel initialJobs={(result.data || []) as Job[]} />
    </main>
  );
}
