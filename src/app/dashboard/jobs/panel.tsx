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
      setMessage(data?.message || "処理を実行できませんでした。設定を確認してください。");
    } else {
      setMessage(`処理が完了しました。テスト実行：${data.dry_run}件、対象：${data.claimed}件`);
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="jobs-stack">
      <section className="card">
        <div className="form-row"><div><h2>予約処理を実行</h2><p className="muted">実行予定の処理を安全に取得し、現在の運用モードで処理します。</p></div><button className="button" disabled={busy} onClick={runDispatcher} type="button">{busy ? "実行中…" : "予約処理を実行"}</button></div>
        {message ? <p className="connection-message" role="status">{message}</p> : null}
      </section>
      <section className="card jobs-table-card">
        <div className="section-heading"><div><div className="eyebrow">履歴</div><h2>最近の実行</h2></div><span className="muted">最大50件</span></div>
        {initialJobs.length === 0 ? <div className="empty-state"><strong>実行履歴はまだありません</strong><p>投稿スケジュールを有効にすると、ここに処理状況が表示されます。</p></div> : <div className="ranking-table-wrap"><table className="ranking-table compact-table"><thead><tr><th>状態</th><th>処理</th><th>実行予定</th><th>試行回数</th><th>エラー</th></tr></thead><tbody>{initialJobs.map((job) => <tr key={job.id}><td><span className={`status-badge ${job.status === "failed" || job.status === "dead_letter" ? "danger" : job.status === "succeeded" ? "success" : "neutral"}`}>{jobStatus(job.status)}</span></td><td><code>{job.job_key}</code></td><td>{new Date(job.scheduled_for).toLocaleString("ja-JP")}</td><td>{job.attempt_count} / {job.max_attempts}</td><td>{job.last_error_code || "なし"}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}

function jobStatus(status: Job["status"]) {
  return { queued: "待機中", running: "実行中", dry_run: "テスト完了", succeeded: "完了", failed: "失敗", cancelled: "取消", dead_letter: "要確認" }[status];
}
