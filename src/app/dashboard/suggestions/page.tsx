import { createClient } from "@/lib/supabase/server";

import { SuggestionsPanel } from "@/app/dashboard/suggestions/panel";

export const dynamic = "force-dynamic";

type Account = { id: string; display_name: string; handle: string; status: string };
type Run = { id: string; requested_account_id: string | null; period_start: string; period_end: string; model: string | null; status: string; input_tokens: number | null; output_tokens: number | null; estimated_cost_usd: number | null; error_message: string | null; created_at: string };
type Suggestion = { id: string; analysis_id: string; kind: "strategy_weight" | "posting_time" | "template"; title: string; recommendation: string; rationale: string; target: Record<string, unknown>; before_value: Record<string, unknown>; proposed_value: Record<string, unknown>; confidence: number | null; status: "pending" | "approved" | "rejected" | "applied"; created_at: string; applied_at: string | null };

export default async function SuggestionsPage() {
  const supabase = await createClient();
  const [accountsResult, runsResult, suggestionsResult] = await Promise.all([
    supabase.from("threads_accounts").select("id, display_name, handle, status").order("created_at", { ascending: true }),
    supabase.from("ai_analysis_runs").select("id, requested_account_id, period_start, period_end, model, status, input_tokens, output_tokens, estimated_cost_usd, error_message, created_at").order("created_at", { ascending: false }).limit(12),
    supabase.from("ai_suggestions").select("id, analysis_id, kind, title, recommendation, rationale, target, before_value, proposed_value, confidence, status, created_at, applied_at").order("created_at", { ascending: false }).limit(30),
  ]);

  return (
    <main className="container main suggestions-page">
      <div className="eyebrow">Phase 9 - AI Suggest</div>
      <h1>運用改善の提案</h1>
      <p className="lede">集計済みのInsightsだけをAIに渡し、戦略配分・投稿時間・テンプレート傾向の改善案を作成します。提案は承認するまで設定へ反映されません。</p>
      {accountsResult.error || runsResult.error || suggestionsResult.error ? <p className="error" role="alert">AI suggestions could not be loaded. Apply the Phase 9 migration and reload.</p> : null}
      <SuggestionsPanel accounts={(accountsResult.data || []) as Account[]} initialRuns={(runsResult.data || []) as Run[]} initialSuggestions={(suggestionsResult.data || []) as Suggestion[]} />
    </main>
  );
}