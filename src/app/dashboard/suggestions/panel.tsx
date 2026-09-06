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
      setMessage(result.message || "AI提案を作成できませんでした。AIの接続設定を確認してください。");
    } else {
      setMessage(result.status === "insufficient_data" ? result.message || "提案を作るためのデータが不足しています。" : `${result.suggestion_count || 0}件の提案を作成しました。内容を確認してください。`);
      router.refresh();
    }
    setBusy(false);
  }

  async function review(suggestionId: string, action: "approve" | "reject" | "apply") {
    setBusy(true);
    setMessage("");
    const result = await invoke({ action, suggestion_id: suggestionId });
    if (!result.ok) {
      setMessage(result.message || "提案の状態を更新できませんでした。");
    } else {
      setSuggestions((current) => current.map((suggestion) => suggestion.id === suggestionId ? { ...suggestion, status: result.status as Suggestion["status"], applied_at: action === "apply" ? new Date().toISOString() : suggestion.applied_at } : suggestion));
      setMessage(action === "apply" ? "提案を設定へ反映しました。" : action === "approve" ? "提案を承認しました。反映する準備ができています。" : "提案を却下しました。");
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
        <div className="section-heading"><div><div className="eyebrow">新しい提案</div><h2>運用データを分析</h2></div><span className="muted">集計済みデータのみ使用</span></div>
        <div className="form-grid three">
          <div className="field"><label htmlFor="suggestion-account">対象アカウント</label><select id="suggestion-account" value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="">全アカウント集計</option>{accounts.filter((account) => account.status === "active").map((account) => <option key={account.id} value={account.id}>{account.display_name} (@{account.handle})</option>)}</select></div>
          <div className="field"><label htmlFor="suggestion-period">分析期間（日）</label><input id="suggestion-period" type="number" min="1" max="90" value={periodDays} onChange={(event) => setPeriodDays(event.target.value)} /></div>
        </div>
        <button className="button" disabled={busy} onClick={generate} type="button">{busy ? "処理中…" : "AI提案を生成"}</button>
        {message ? <p className="connection-message" role="status">{message}</p> : null}
      </section>
      <section className="card">
        <div className="section-heading"><div><div className="eyebrow">確認</div><h2>提案一覧</h2></div><span className="muted">承認後にのみ反映できます</span></div>
        {suggestions.length === 0 ? <div className="empty-state"><strong>提案はまだありません</strong><p>分析を実行すると、改善案がここに表示されます。</p></div> : <div className="suggestions-list">{suggestions.map((suggestion) => <article className="suggestion-row" key={suggestion.id}><div className="suggestion-heading"><div><strong>{suggestion.title}</strong><div className="suggestion-meta"><span>{kindLabel(suggestion.kind)}</span><span>確信度 {suggestion.confidence === null ? "未算出" : `${Math.round(suggestion.confidence * 100)}%`}</span><span className={`status-badge ${suggestion.status === "approved" || suggestion.status === "applied" ? "success" : suggestion.status === "rejected" ? "danger" : "warning"}`}>{suggestionStatus(suggestion.status)}</span></div></div></div><p>{suggestion.recommendation}</p><p className="muted">根拠：{suggestion.rationale}</p><div className="suggestion-values"><div><span className="muted">現在</span><code>{formatValue(suggestion.before_value)}</code></div><div><span className="muted">変更案</span><code>{formatValue(suggestion.proposed_value)}</code></div></div>{suggestion.status === "pending" ? <div className="form-row"><button className="button secondary" disabled={busy} onClick={() => review(suggestion.id, "reject")} type="button">却下</button><button className="button" disabled={busy} onClick={() => review(suggestion.id, "approve")} type="button">承認</button></div> : suggestion.status === "approved" ? <button className="button" disabled={busy} onClick={() => review(suggestion.id, "apply")} type="button">設定へ反映</button> : null}</article>)}</div>}
      </section>
      <details className="card disclosure">
        <summary><span><span className="eyebrow">履歴</span><strong>過去の分析実行</strong></span><span className="muted">{runs.length}件</span></summary>
        {runs.length === 0 ? <p className="muted">分析実行履歴はありません。</p> : <div className="ranking-table-wrap"><table className="ranking-table compact-table"><thead><tr><th>実行日時</th><th>状態</th><th>分析期間</th><th>メモ</th></tr></thead><tbody>{runs.map((run) => <tr key={run.id}><td>{new Date(run.created_at).toLocaleString("ja-JP")}</td><td>{runStatus(run.status)}</td><td>{new Date(run.period_start).toLocaleDateString("ja-JP")} ～ {new Date(run.period_end).toLocaleDateString("ja-JP")}</td><td>{run.error_message || "なし"}</td></tr>)}</tbody></table></div>}
      </details>
    </div>
  );
}

function kindLabel(kind: Suggestion["kind"]) { return kind === "strategy_weight" ? "戦略配分" : kind === "posting_time" ? "投稿時間" : "テンプレート傾向"; }
function formatValue(value: Record<string, unknown>) { return JSON.stringify(value); }
function suggestionStatus(status: Suggestion["status"]) { return { pending: "確認待ち", approved: "承認済み", rejected: "却下", applied: "反映済み" }[status]; }
function runStatus(status: string) { return { completed: "完了", running: "分析中", failed: "失敗", insufficient_data: "データ不足" }[status] || status; }
