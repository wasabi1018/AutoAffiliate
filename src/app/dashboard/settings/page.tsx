import { createClient } from "@/lib/supabase/server";

import { AccountSettings, FilterSettings, OperationsSettings, ScheduleSettings, StrategySettings, TemplateSettings } from "@/app/dashboard/settings/forms";

export const dynamic = "force-dynamic";

type Account = { id: string; display_name: string; handle: string; genre: string; status: "active" | "paused" | "disabled" };
type Schedule = { account_id: string; weekdays: number[]; posting_times: string[]; timezone: string; enabled: boolean };
type Template = { id: string; name: string; template_type: "hook" | "reply"; body: string; active: boolean };

export default async function SettingsPage() {
  const supabase = await createClient();
  const [accountsResult, strategyResult, filtersResult, templatesResult, schedulesResult, operationsResult] = await Promise.all([
    supabase.from("threads_accounts").select("id, display_name, handle, genre, status").order("created_at", { ascending: true }),
    supabase.from("strategy_settings").select("ranking_weight, sale_weight, trending_weight").eq("id", true).maybeSingle(),
    supabase.from("product_filters").select("min_price, max_price, require_in_stock, min_review_count, excluded_words").eq("id", true).maybeSingle(),
    supabase.from("post_templates").select("id, name, template_type, body, active").order("created_at", { ascending: true }),
    supabase.from("posting_schedules").select("account_id, weekdays, posting_times, timezone, enabled"),
    supabase.from("app_settings").select("dry_run, auto_posting_enabled, global_stop, emergency_stop").eq("id", true).maybeSingle(),
  ]);

  const accounts = (accountsResult.data || []) as Account[];
  const strategy = strategyResult.data || { ranking_weight: 60, sale_weight: 20, trending_weight: 20 };
  const filters = filtersResult.data || { min_price: 0, max_price: null, require_in_stock: true, min_review_count: 0, excluded_words: [] };
  const operations = operationsResult.data || { dry_run: true, auto_posting_enabled: false, global_stop: false, emergency_stop: false };

  return (
    <main className="container main settings-page">
      <div className="eyebrow">Phase 2 · Operations settings</div>
      <h1>運用設定</h1>
      <p className="lede">投稿前に、アカウント・商品条件・文面・スケジュールを管理します。保存に失敗した場合は入力内容と管理者権限を確認してください。</p>
      {accountsResult.error || strategyResult.error || filtersResult.error || templatesResult.error || schedulesResult.error || operationsResult.error ? <p className="error" role="alert">設定データの一部を読み込めませんでした。マイグレーション適用後に再読み込みしてください。</p> : null}
      <div className="settings-stack">
        <OperationsSettings operations={operations} />
        <AccountSettings accounts={accounts} />
        <ScheduleSettings accounts={accounts} schedules={(schedulesResult.data || []) as Schedule[]} />
        <StrategySettings strategy={strategy} />
        <FilterSettings filters={filters} />
        <TemplateSettings templates={(templatesResult.data || []) as Template[]} />
      </div>
    </main>
  );
}
