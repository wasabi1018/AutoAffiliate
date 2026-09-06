"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

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

export function JobsPanel({ initialJobs }: { initialJobs: Job[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function runDispatcher() {
    setBusy(true);
    setMessage("");
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("dispatcher", { body: { source: "manual" } });
    if (error || !data?.ok) {
      setMessage(data?.message || "Dispatcher failed. Check the Phase 5 function deployment.");
    } else {
      setMessage("Dispatcher completed: " + data.dry_run + " dry-run job(s), " + data.claimed + " claimed.");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="jobs-stack">
      <section className="card">
        <div className="form-row"><div><strong>Safe dispatcher</strong><p className="muted">The dispatcher claims due jobs with a lock and records an audit attempt. Publishing remains disabled.</p></div><button className="button" disabled={busy} onClick={runDispatcher} type="button">{busy ? "Running..." : "Run dispatcher"}</button></div>
        {message ? <p className="connection-message" role="status">{message}</p> : null}
      </section>
      <section className="card jobs-table-card">
        {initialJobs.length === 0 ? <p className="muted">No scheduled jobs have been generated yet. Enable a posting schedule, then invoke the dispatcher.</p> : <div className="ranking-table-wrap"><table className="ranking-table"><thead><tr><th>Status</th><th>Job</th><th>Scheduled</th><th>Attempts</th><th>Last error</th></tr></thead><tbody>{initialJobs.map((job) => <tr key={job.id}><td><strong>{job.status}</strong></td><td><code>{job.job_key}</code><br /><span className="muted">Account {job.account_id.slice(0, 8)}...</span></td><td>{new Date(job.scheduled_for).toLocaleString("en-US")}</td><td>{job.attempt_count} / {job.max_attempts}</td><td>{job.last_error_code || "-"}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}
