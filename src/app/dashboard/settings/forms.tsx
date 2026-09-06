"use client";

import { useActionState, useState } from "react";

import { saveAccount, saveFilters, saveOperations, saveSchedule, saveStrategy, saveTemplate } from "@/app/dashboard/settings/actions";
import type { ActionState } from "@/lib/settings/validation";

type Account = { id: string; display_name: string; handle: string; genre: string; status: "active" | "paused" | "disabled" };
type Strategy = { ranking_weight: number; sale_weight: number; trending_weight: number };
type Filters = { min_price: number; max_price: number | null; require_in_stock: boolean; min_review_count: number; excluded_words: string[] };
type Template = { id: string; name: string; template_type: "hook" | "reply"; body: string; active: boolean };
type Schedule = { account_id: string; weekdays: number[]; posting_times: string[]; timezone: string; enabled: boolean };
type Operations = { dry_run: boolean; auto_posting_enabled: boolean; global_stop: boolean; emergency_stop: boolean };

const initialState: ActionState = { ok: false, message: "" };

function ActionMessage({ state }: { state: ActionState }) {
  return state.message ? <p className={state.ok ? "success" : "error"} role="status">{state.message}</p> : null;
}

function AccountForm({ account }: { account?: Account }) {
  const [state, action, pending] = useActionState(saveAccount, initialState);
  return (
    <form className="settings-form" action={action}>
      {account ? <input name="id" type="hidden" value={account.id} /> : null}
      <div className="form-grid three">
        <div className="field"><label htmlFor={`display-name-${account?.id || "new"}`}>表示名</label><input id={`display-name-${account?.id || "new"}`} name="display_name" required maxLength={80} defaultValue={account?.display_name} /></div>
        <div className="field"><label htmlFor={`handle-${account?.id || "new"}`}>Threadsユーザーネーム</label><input id={`handle-${account?.id || "new"}`} name="handle" required pattern="[A-Za-z0-9._]{1,30}" defaultValue={account?.handle} placeholder="example_account" /></div>
        <div className="field"><label htmlFor={`genre-${account?.id || "new"}`}>ジャンル</label><input id={`genre-${account?.id || "new"}`} name="genre" required maxLength={80} defaultValue={account?.genre} placeholder="暮らし" /></div>
      </div>
      <div className="form-row"><div className="field"><label htmlFor={`status-${account?.id || "new"}`}>状態</label><select id={`status-${account?.id || "new"}`} name="status" defaultValue={account?.status || "active"}><option value="active">稼働</option><option value="paused">一時停止</option><option value="disabled">無効</option></select></div><button className="button" disabled={pending} type="submit">{pending ? "保存中…" : account ? "アカウントを更新" : "アカウントを追加"}</button></div>
      <ActionMessage state={state} />
    </form>
  );
}

export function AccountSettings({ accounts }: { accounts: Account[] }) {
  return <section className="card settings-section"><div className="section-heading"><div><div className="eyebrow">Threads accounts</div><h2>アカウント</h2></div><span className="muted">停止中のアカウントは次フェーズでジョブ対象外になります。</span></div><div className="stack">{accounts.map((account) => <AccountForm account={account} key={account.id} />)}<AccountForm /></div></section>;
}

export function StrategySettings({ strategy }: { strategy: Strategy }) {
  const [state, action, pending] = useActionState(saveStrategy, initialState);
  return <section className="card settings-section"><div className="eyebrow">Selection strategy</div><h2>戦略の重み</h2><p className="muted">Phase 2では設定と変更履歴だけを管理します。合計100%が必須です。</p><form className="settings-form" action={action}><div className="form-grid three">{([ ["ranking_weight", "RANKING", strategy.ranking_weight], ["sale_weight", "SALE", strategy.sale_weight], ["trending_weight", "TRENDING", strategy.trending_weight] ] as const).map(([name, label, value]) => <div className="field" key={name}><label htmlFor={name}>{label} (%)</label><input id={name} name={name} type="number" min="0" max="100" step="0.01" required defaultValue={value} /></div>)}</div><div className="form-row"><span /><button className="button" disabled={pending} type="submit">{pending ? "保存中…" : "重みを保存"}</button></div><ActionMessage state={state} /></form></section>;
}

export function FilterSettings({ filters }: { filters: Filters }) {
  const [state, action, pending] = useActionState(saveFilters, initialState);
  return <section className="card settings-section"><div className="eyebrow">Product filters</div><h2>商品フィルター</h2><form className="settings-form" action={action}><div className="form-grid three"><div className="field"><label htmlFor="min-price">最低価格（円）</label><input id="min-price" name="min_price" type="number" min="0" step="1" required defaultValue={filters.min_price} /></div><div className="field"><label htmlFor="max-price">最高価格（円）</label><input id="max-price" name="max_price" type="number" min="0" step="1" defaultValue={filters.max_price ?? ""} placeholder="上限なし" /></div><div className="field"><label htmlFor="min-review-count">最低レビュー数</label><input id="min-review-count" name="min_review_count" type="number" min="0" step="1" required defaultValue={filters.min_review_count} /></div></div><div className="field"><label htmlFor="excluded-words">除外語（カンマ区切り）</label><input id="excluded-words" name="excluded_words" defaultValue={filters.excluded_words.join(", ")} placeholder="中古, 訳あり" /></div><label className="checkbox"><input name="require_in_stock" type="checkbox" defaultChecked={filters.require_in_stock} /> 在庫あり商品のみ</label><div className="form-row"><span /><button className="button" disabled={pending} type="submit">{pending ? "保存中…" : "フィルターを保存"}</button></div><ActionMessage state={state} /></form></section>;
}

function TemplateForm({ template }: { template?: Template }) {
  const [state, action, pending] = useActionState(saveTemplate, initialState);
  const [body, setBody] = useState(template?.body || "");
  const preview = body.replace(/{{\s*product_name\s*}}/g, "折りたたみ収納ボックス").replace(/{{\s*price\s*}}/g, "1,980円").replace(/{{\s*affiliate_url\s*}}/g, "https://item.rakuten.co.jp/example").replace(/{{\s*genre\s*}}/g, "暮らし").replace(/{{\s*display_name\s*}}/g, "Auto Affiliater").replace(/{{\s*pr\s*}}/g, "PR");
  return <form className="settings-form template-form" action={action}>{template ? <input name="id" type="hidden" value={template.id} /> : null}<div className="form-grid three"><div className="field"><label htmlFor={`template-name-${template?.id || "new"}`}>テンプレート名</label><input id={`template-name-${template?.id || "new"}`} name="name" required maxLength={80} defaultValue={template?.name} /></div><div className="field"><label htmlFor={`template-type-${template?.id || "new"}`}>種類</label><select id={`template-type-${template?.id || "new"}`} name="template_type" defaultValue={template?.template_type || "hook"}><option value="hook">Hook</option><option value="reply">Reply</option></select></div><label className="checkbox"><input name="active" type="checkbox" defaultChecked={template?.active ?? true} /> 有効</label></div><div className="field"><label htmlFor={`template-body-${template?.id || "new"}`}>本文</label><textarea id={`template-body-${template?.id || "new"}`} name="body" required maxLength={1000} rows={5} value={body} onChange={(event) => setBody(event.target.value)} placeholder="{{product_name}} が便利でした。{{pr}}" /></div><div className="template-help"><span className="muted">使用可能: <code>{"{{product_name}}"}</code> <code>{"{{price}}"}</code> <code>{"{{affiliate_url}}"}</code> <code>{"{{genre}}"}</code> <code>{"{{display_name}}"}</code> <code>{"{{pr}}"}</code></span><div className="preview"><strong>プレビュー</strong><p>{preview || "本文を入力するとプレビューされます。"}</p></div></div><div className="form-row"><span /><button className="button" disabled={pending} type="submit">{pending ? "保存中…" : template ? "テンプレートを更新" : "テンプレートを追加"}</button></div><ActionMessage state={state} /></form>;
}

export function TemplateSettings({ templates }: { templates: Template[] }) {
  return <section className="card settings-section"><div className="eyebrow">Copy templates</div><h2>Hook / Replyテンプレート</h2><div className="stack">{templates.map((template) => <TemplateForm key={template.id} template={template} />)}<TemplateForm /></div></section>;
}

export function ScheduleSettings({ accounts, schedules }: { accounts: Account[]; schedules: Schedule[] }) {
  const scheduleByAccount = new Map(schedules.map((schedule) => [schedule.account_id, schedule]));
  return <section className="card settings-section"><div className="eyebrow">Posting schedule</div><h2>投稿スケジュール</h2><p className="muted">曜日は0=日曜〜6=土曜、時刻はカンマ区切りのHH:MMです。</p><div className="stack">{accounts.map((account) => <ScheduleForm account={account} schedule={scheduleByAccount.get(account.id)} key={account.id} />)}{accounts.length === 0 ? <p className="muted">先にThreadsアカウントを追加してください。</p> : null}</div></section>;
}

function ScheduleForm({ account, schedule }: { account: Account; schedule?: Schedule }) {
  const [state, action, pending] = useActionState(saveSchedule, initialState);
  return <form className="settings-form" action={action}><input name="account_id" type="hidden" value={account.id} /><strong>{account.display_name} <span className="muted">@{account.handle}</span></strong><div className="form-grid three"><div className="field"><label htmlFor={`weekdays-${account.id}`}>曜日</label><input id={`weekdays-${account.id}`} name="weekdays" required defaultValue={schedule?.weekdays.join(",") || "1,3,5"} placeholder="1,3,5" /></div><div className="field"><label htmlFor={`posting-times-${account.id}`}>投稿時刻</label><input id={`posting-times-${account.id}`} name="posting_times" required defaultValue={schedule?.posting_times.join(",") || "09:00,18:00"} placeholder="09:00,18:00" /></div><div className="field"><label htmlFor={`timezone-${account.id}`}>タイムゾーン</label><input id={`timezone-${account.id}`} name="timezone" required defaultValue={schedule?.timezone || "Asia/Tokyo"} /></div></div><div className="form-row"><label className="checkbox"><input name="enabled" type="checkbox" defaultChecked={schedule?.enabled ?? true} /> 有効</label><button className="button" disabled={pending} type="submit">{pending ? "保存中…" : "スケジュールを保存"}</button></div><ActionMessage state={state} /></form>;
}

export function OperationsSettings({ operations }: { operations: Operations }) {
  const [state, action, pending] = useActionState(saveOperations, initialState);
  return <section className="card settings-section"><div className="eyebrow">Safety controls</div><h2>停止・投稿モード</h2><p className="muted">自動投稿は初期状態で無効です。緊急停止は次フェーズの実行側でも強制します。</p><form className="settings-form" action={action}><div className="toggle-list"><label className="checkbox"><input name="dry_run" type="checkbox" defaultChecked={operations.dry_run} /> Dry Run（推奨）</label><label className="checkbox"><input name="auto_posting_enabled" type="checkbox" defaultChecked={operations.auto_posting_enabled} /> 自動投稿を許可</label><label className="checkbox"><input name="global_stop" type="checkbox" defaultChecked={operations.global_stop} /> 全体停止</label><label className="checkbox danger-toggle"><input name="emergency_stop" type="checkbox" defaultChecked={operations.emergency_stop} /> 緊急停止</label></div><div className="form-row"><span /><button className="button" disabled={pending} type="submit">{pending ? "保存中…" : "運用設定を保存"}</button></div><ActionMessage state={state} /></form></section>;
}
