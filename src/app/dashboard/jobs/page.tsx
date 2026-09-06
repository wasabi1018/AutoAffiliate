import { createClient } from "@/lib/supabase/server";

import { JobsPanel } from "@/app/dashboard/jobs/panel";

export const dynamic = "force-dynamic";

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
    <main className="container main jobs-page">
      <div className="eyebrow">Phase 5 - Dispatcher</div>
      <h1>Scheduled jobs</h1>
      <p className="lede">Inspect queued work and run the dispatcher in Dry Run mode. No Threads post is sent in Phase 5.</p>
      {result.error ? <p className="error" role="alert">Jobs could not be loaded. Apply the Phase 5 migration and reload.</p> : null}
      <JobsPanel initialJobs={(result.data || []) as Job[]} />
    </main>
  );
}
