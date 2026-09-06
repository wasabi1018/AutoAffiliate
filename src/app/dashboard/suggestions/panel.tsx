"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Account = { id: string; display_name: string; handle: string; status: string };
type Run = { id: string; requested_account_id: string | null; period_start: string; period_end: string; model: string | null; status: string; input_tokens: number | null; output_tokens: number | null; estimated_cost_usd: number | null; error_message: string | null; created_at: string };
type Suggestion = { id: string; analysis_id: string; kind: "strategy_weight" | "posting_time" | "template"; title: string; recommendation: string; rationale: string; target: Record<string, unknown>; before_value: Record<string, unknown>; proposed_value: Record<string, unknown>; confidence: number | null; status: "pending" | "approved" | "rejected" | "applied"; created_at: string; applied_at: string | null };
type FunctionResult = { ok: boolean; run_id?: string; status?: string; suggestion_count?: number; message?: string; suggestion_id?: string };

export function SuggestionsPanel({ accounts, initialRuns, initialSuggestions }: { accounts: Account[]; initialRuns: Run[]; initialSuggestions: Suggestion[] }) {
  const router = useRouter();
  const [accountId, setAccountId] = useState("");
  const [periodDays, setPeriodDays] = useState("30");
  const [runs] = useState(initialRuns);
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function generate() {
    setBusy(true);
    setMessage("");
    const result = await invoke({ action: "generate", account_id: accountId || undefined, period_days: Number(periodDays) || 30 });
    if (!result.ok) {
      setMessage(result.message || "AI suggestion generation failed. Configure AI Gateway and apply the Phase 9 migration.");
    } else {
      setMessage(result.status === "insufficient_data" ? result.message || "Not enough data for a suggestion." : `${result.suggestion_count || 0} suggestion(s) generated for review.`);
      router.refresh();
    }
    setBusy(false);
  }

  async function review(suggestionId: string, action: "approve" | "reject" | "apply") {
    setBusy(true);
    setMessage("");
    const result = await invoke({ action, suggestion_id: suggestionId });
    if (!result.ok) {
      setMessage(result.message || "Could not update the suggestion.");
    } else {
      setSuggestions((current) => current.map((suggestion) => suggestion.id === suggestionId ? { ...suggestion, status: result.status as Suggestion["status"], applied_at: action === "apply" ? new Date().toISOString() : suggestion.applied_at } : suggestion));
      setMessage(action === "apply" ? "Suggestion applied within the allowed range." : action === "approve" ? "Suggestion approved. Apply it explicitly when ready." : "Suggestion rejected.");
      router.refresh();
    }
    setBusy(false);
  }

  async function invoke(body: Record<string, unknown>) {
    const supabase = createClient();
    const { data, error } = await supabase.functions.invoke("ai-suggest", { body });
    return (data || { ok: false, message: error?.message }) as FunctionResult;
  }

  return (
    <div className="suggestions-stack">
      <section className="card">
        <div className="section-heading"><div><div className="eyebrow">Aggregate-only analysis</div><h2>提案を生成</h2></div><span className="muted">コード・秘密情報・RLSはAI入力外</span></div>
        <div className="form-grid three">
          <div className="field"><label htmlFor="suggestion-account">対象アカウント</label><select id="suggestion-account" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">全アカウント集計</option>{accounts.filter((account) => account.status === "active").map((account) => <option key={account.id} value={account.id}>{account.display_name} (@{account.handle})</option>)}</select></div>
          <div className="field"><label htmlFor="suggestion-period">分析期間（日）</label><input id="suggestion-period" type="number" min="1" max="90" value={periodDays} onChange={(event) => setPeriodDays(event.target.value)} /></div>
        </div>
        <button className="button" disabled={busy} onClick={generate} type="button">{busy ? "処理中…" : "AI提案を生成"}</button>
        {message ? <p className="connection-message" role="status">{message}</p> : null}
      </section>
      <section className="card">
        <div className="section-heading"><div><div className="eyebrow">Human review gate</div><h2>提案一覧</h2></div><span className="muted">承認後にのみ適用可能</span></div>
        {suggestions.length === 0 ? <p className="muted">まだ提案はありません。</p> : <div className="suggestions-list">{suggestions.map((suggestion) => <article className="suggestion-row" key={suggestion.id}><div className="suggestion-heading"><div><strong>{suggestion.title}</strong><div className="muted">{kindLabel(suggestion.kind)} · confidence {suggestion.confidence === null ? "-" : `${Math.round(suggestion.confidence * 100)}%`} · {suggestion.status}</div></div><code>{suggestion.id.slice(0, 8)}…</code></div><p>{suggestion.recommendation}</p><p className="muted">根拠: {suggestion.rationale}</p><div className="suggestion-values"><div><span className="muted">Before</span><code>{formatValue(suggestion.before_value)}</code></div><div><span className="muted">Proposed</span><code>{formatValue(suggestion.proposed_value)}</code></div></div>{suggestion.status === "pending" ? <div className="form-row"><button className="button secondary" disabled={busy} onClick={() => review(suggestion.id, "reject")} type="button">Reject</button><button className="button" disabled={busy} onClick={() => review(suggestion.id, "approve")} type="button">Approve</button></div> : suggestion.status === "approved" ? <button className="button" disabled={busy} onClick={() => review(suggestion.id, "apply")} type="button">Apply approved change</button> : null}</article>)}</div>}
      </section>
      <section className="card">
        <div className="section-heading"><div><div className="eyebrow">Audit trail</div><h2>分析実行履歴</h2></div><span className="muted">{runs.length} runs</span></div>
        {runs.length === 0 ? <p className="muted">分析実行履歴はありません。</p> : <div className="ranking-table-wrap"><table className="ranking-table"><thead><tr><th>Created</th><th>Status</th><th>Period</th><th>Model</th><th>Tokens</th><th>Estimated cost</th><th>Note</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td>{new Date(run.created_at).toLocaleString("ja-JP")}</td><td><strong>{run.status}</strong></td><td>{new Date(run.period_start).toLocaleDateString("ja-JP")} - {new Date(run.period_end).toLocaleDateString("ja-JP")}</td><td><code>{run.model || "-"}</code></td><td>{run.input_tokens ?? "-"} / {run.output_tokens ?? "-"}</td><td>{run.estimated_cost_usd === null ? "-" : `$${Number(run.estimated_cost_usd).toFixed(6)}`}</td><td>{run.error_message || "-"}</td></tr>)}</tbody></table></div>}
      </section>
    </div>
  );
}

function kindLabel(kind: Suggestion["kind"]) { return kind === "strategy_weight" ? "戦略配分" : kind === "posting_time" ? "投稿時間" : "テンプレート傾向"; }
function formatValue(value: Record<string, unknown>) { return JSON.stringify(value); }