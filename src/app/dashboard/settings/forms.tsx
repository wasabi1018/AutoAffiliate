"use client";

import { useActionState, useState } from "react";

import { saveAccount, saveFilters, saveOperations, saveSchedule, saveStrategy, saveTemplate } from "@/app/dashboard/settings/actions";
import { formatPostingTimes } from "@/lib/settings/time";
import type { ActionState } from "@/lib/settings/validation";
import { RAKUTEN_GENRES } from '@/lib/rakuten-genres';

type Account = { id: string; display_name: string; handle: string; genre: string; genre_id: number | null; operation_mode: 'semi_auto' | 'auto'; status: 'active' | 'paused' | 'disabled' };
type Strategy = { ranking_weight: number; sale_weight: number; trending_weight: number };
type Filters = { min_price: number; max_price: number | null; require_in_stock: boolean; min_review_count: number; excluded_words: string[] };
type Template = { id: string; name: string; template_type: "hook" | "reply"; body: string; active: boolean };
type Schedule = { account_id: string; weekdays: number[]; posting_times: string[]; timezone: string; enabled: boolean };
type Operations = { dry_run: boolean; live_posting_enabled: boolean; auto_posting_enabled: boolean; global_stop: boolean; emergency_stop: boolean };

const initialState: ActionState = { ok: false, message: "" };
const weekdays = [[0, "日"], [1, "月"], [2, "火"], [3, "水"], [4, "木"], [5, "金"], [6, "土"]] as const;

function ActionMessage({ state }: { state: ActionState }) {
  return state.message ? <p className={state.ok ? "success notice" : "error notice"} role="status">{state.message}</p> : null;
}

function AccountForm({ account }: { account?: Account }) {
  const [state, action, pending] = useActionState(saveAccount, initialState);
  return (
    <form className="settings-form" action={action}>
      {account ? <input name="id" type="hidden" value={account.id} /> : null}
      <div className="form-grid three">
        <div className="field"><label htmlFor={`display-name-${account?.id || "new"}`}>表示名</label><input id={`display-name-${account?.id || "new"}`} name="display_name" required maxLength={80} defaultValue={account?.display_name} /></div>
        <div className="field"><label htmlFor={`handle-${account?.id || "new"}`}>Threadsユーザーネーム</label><input id={`handle-${account?.id || "new"}`} name="handle" required pattern="[A-Za-z0-9._]{1,30}" defaultValue={account?.handle} placeholder="example_account" /></div>
        <div className='field'>
          <label htmlFor={`genre-${account?.id || 'new'}`}>投稿する楽天ジャンル</label>
          <select id={`genre-${account?.id || 'new'}`} name='genre_id' required defaultValue={account?.genre_id ?? ''}>
            <option value=''>ジャンルを選択</option>
            {RAKUTEN_GENRES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
          <span className='field-help'>このジャンルの商品を自動選定します</span>
        </div>
      </div>
      <div className='form-grid two'>
        <div className='field'><label htmlFor={`mode-${account?.id || 'new'}`}>運用モード</label><select id={`mode-${account?.id || 'new'}`} name='operation_mode' defaultValue={account?.operation_mode || 'semi_auto'}><option value='semi_auto'>半自動（承認して投稿）</option><option value='auto'>自動投稿</option></select><span className='field-help'>最初は半自動を推奨します</span></div>
        <div className='field'><label htmlFor={`status-${account?.id || 'new'}`}>状態</label><select id={`status-${account?.id || 'new'}`} name='status' defaultValue={account?.status || 'active'}><option value='active'>稼働</option><option value='paused'>一時停止</option><option value='disabled'>無効</option></select></div>
      </div>
      <div className='form-row'><span /><button className='button' disabled={pending} type='submit'>{pending ? '保存中…' : account ? '更新' : 'アカウントを追加'}</button></div>
      <ActionMessage state={state} />
    </form>
  );
}

export function OperationsSettings({ operations }: { operations: Operations }) {
  const [state, action, pending] = useActionState(saveOperations, initialState);
  return <section className='card settings-section'><div className='eyebrow'>安全設定</div><h2>投稿モードと停止</h2><p className='muted'>最初はテスト運用と半自動で確認し、準備ができてから自動投稿を許可してください。</p><form className='settings-form' action={action}><div className='toggle-list'><label className='checkbox'><input name='dry_run' type='checkbox' defaultChecked={operations.dry_run} /> テスト運用（Threadsへ投稿しない）</label><label className='checkbox'><input name='live_posting_enabled' type='checkbox' defaultChecked={operations.live_posting_enabled} /> 承認後の本番投稿を許可</label><label className='checkbox'><input name='auto_posting_enabled' type='checkbox' defaultChecked={operations.auto_posting_enabled} /> 自動モードの本番投稿を許可</label><label className='checkbox'><input name='global_stop' type='checkbox' defaultChecked={operations.global_stop} /> すべての自動処理を停止</label><label className='checkbox danger-toggle'><input name='emergency_stop' type='checkbox' defaultChecked={operations.emergency_stop} /> 緊急停止</label></div><div className='form-row'><span /><button className='button' disabled={pending} type='submit'>{pending ? '保存中…' : '安全設定を保存'}</button></div><ActionMessage state={state} /></form></section>;
}

export function AccountSettings({ accounts }: { accounts: Account[] }) {
  return <section className="card settings-section"><div className="section-heading"><div><div className="eyebrow">アカウント管理</div><h2>Threadsアカウント</h2></div><span className="muted">停止中は自動処理の対象外です</span></div><div className="stack">{accounts.map((account) => <AccountForm account={account} key={account.id} />)}<AccountForm /></div></section>;
}

export function ScheduleSettings({ accounts, schedules }: { accounts: Account[]; schedules: Schedule[] }) {
  const scheduleByAccount = new Map(schedules.map((schedule) => [schedule.account_id, schedule]));
  return <section className="card settings-section"><div className="eyebrow">自動運用</div><h2>投稿スケジュール</h2><p className="muted">投稿する曜日と時刻をアカウントごとに設定します。</p><div className="stack">{accounts.map((account) => <ScheduleForm account={account} schedule={scheduleByAccount.get(account.id)} key={account.id} />)}{accounts.length === 0 ? <div className="empty-state"><strong>設定できるアカウントがありません</strong><p>先にThreadsアカウントを追加してください。</p></div> : null}</div></section>;
}

function ScheduleForm({ account, schedule }: { account: Account; schedule?: Schedule }) {
  const [state, action, pending] = useActionState(saveSchedule, initialState);
  const selected = schedule?.weekdays || [1, 3, 5];
  return <form className="settings-form" action={action}><input name="account_id" type="hidden" value={account.id} /><strong>{account.display_name} <span className="muted">@{account.handle}</span></strong><fieldset className="field weekday-field"><legend>投稿する曜日</legend><div className="weekday-options">{weekdays.map(([value, label]) => <label className="weekday-option" key={value}><input name="weekdays" type="checkbox" value={value} defaultChecked={selected.includes(value)} /><span>{label}</span></label>)}</div></fieldset><div className="form-grid two"><div className="field"><label htmlFor={`posting-times-${account.id}`}>投稿時刻</label><input id={`posting-times-${account.id}`} name="posting_times" required defaultValue={schedule ? formatPostingTimes(schedule.posting_times) : "09:00,18:00"} placeholder="09:00,18:00" /><span className="field-help">複数の場合はカンマで区切ります</span></div><div className="field"><label htmlFor={`timezone-${account.id}`}>タイムゾーン</label><input id={`timezone-${account.id}`} name="timezone" required defaultValue={schedule?.timezone || "Asia/Tokyo"} /></div></div><div className="form-row"><label className="checkbox"><input name="enabled" type="checkbox" defaultChecked={schedule?.enabled ?? true} /> このスケジュールを有効にする</label><button className="button" disabled={pending} type="submit">{pending ? "保存中…" : "スケジュールを保存"}</button></div><ActionMessage state={state} /></form>;
}

export function StrategySettings({ strategy }: { strategy: Strategy }) {
  const [state, action, pending] = useActionState(saveStrategy, initialState);
  const options = [["ranking_weight", "ランキング", strategy.ranking_weight], ["sale_weight", "セール", strategy.sale_weight], ["trending_weight", "トレンド", strategy.trending_weight]] as const;
  return <section className="card settings-section"><div className="eyebrow">商品選定</div><h2>選定戦略の配分</h2><p className="muted">商品の評価で重視する割合です。合計を100%にしてください。</p><form className="settings-form" action={action}><div className="form-grid three">{options.map(([name, label, value]) => <div className="field" key={name}><label htmlFor={name}>{label}（%）</label><input id={name} name={name} type="number" min="0" max="100" step="0.01" required defaultValue={value} /></div>)}</div><div className="form-row"><span /><button className="button" disabled={pending} type="submit">{pending ? "保存中…" : "配分を保存"}</button></div><ActionMessage state={state} /></form></section>;
}

export function FilterSettings({ filters }: { filters: Filters }) {
  const [state, action, pending] = useActionState(saveFilters, initialState);
  return <section className="card settings-section"><div className="eyebrow">商品選定</div><h2>商品条件</h2><form className="settings-form" action={action}><div className="form-grid three"><div className="field"><label htmlFor="min-price">最低価格（円）</label><input id="min-price" name="min_price" type="number" min="0" step="1" required defaultValue={filters.min_price} /></div><div className="field"><label htmlFor="max-price">最高価格（円）</label><input id="max-price" name="max_price" type="number" min="0" step="1" defaultValue={filters.max_price ?? ""} placeholder="上限なし" /></div><div className="field"><label htmlFor="min-review-count">最低レビュー数</label><input id="min-review-count" name="min_review_count" type="number" min="0" step="1" required defaultValue={filters.min_review_count} /></div></div><div className="field"><label htmlFor="excluded-words">除外する言葉（カンマ区切り）</label><input id="excluded-words" name="excluded_words" defaultValue={filters.excluded_words.join(", ")} placeholder="中古, 訳あり" /></div><label className="checkbox"><input name="require_in_stock" type="checkbox" defaultChecked={filters.require_in_stock} /> 在庫がある商品のみ</label><div className="form-row"><span /><button className="button" disabled={pending} type="submit">{pending ? "保存中…" : "商品条件を保存"}</button></div><ActionMessage state={state} /></form></section>;
}

function TemplateForm({ template }: { template?: Template }) {
  const [state, action, pending] = useActionState(saveTemplate, initialState);
  const [body, setBody] = useState(template?.body || "");
  const preview = body.replace(/{{\s*product_name\s*}}/g, "折りたたみ収納ボックス").replace(/{{\s*price\s*}}/g, "1,980円").replace(/{{\s*affiliate_url\s*}}/g, "https://item.rakuten.co.jp/example").replace(/{{\s*genre\s*}}/g, "暮らし").replace(/{{\s*display_name\s*}}/g, "Auto Affiliater").replace(/{{\s*pr\s*}}/g, "PR");
  return <form className="settings-form template-form" action={action}>{template ? <input name="id" type="hidden" value={template.id} /> : null}<div className="form-grid three"><div className="field"><label htmlFor={`template-name-${template?.id || "new"}`}>テンプレート名</label><input id={`template-name-${template?.id || "new"}`} name="name" required maxLength={80} defaultValue={template?.name} /></div><div className="field"><label htmlFor={`template-type-${template?.id || "new"}`}>種類</label><select id={`template-type-${template?.id || "new"}`} name="template_type" defaultValue={template?.template_type || "hook"}><option value="hook">投稿本文</option><option value="reply">返信文</option></select></div><label className="checkbox"><input name="active" type="checkbox" defaultChecked={template?.active ?? true} /> 有効</label></div><div className="field"><label htmlFor={`template-body-${template?.id || "new"}`}>本文</label><textarea id={`template-body-${template?.id || "new"}`} name="body" required maxLength={1000} rows={5} value={body} onChange={(event) => setBody(event.target.value)} placeholder="{{product_name}} が便利でした。{{pr}}" /></div><div className="template-help"><details><summary>差し込み項目を表示</summary><p className="muted"><code>{"{{product_name}}"}</code> <code>{"{{price}}"}</code> <code>{"{{affiliate_url}}"}</code> <code>{"{{genre}}"}</code> <code>{"{{display_name}}"}</code> <code>{"{{pr}}"}</code></p></details><div className="preview"><strong>プレビュー</strong><p>{preview || "本文を入力するとプレビューされます。"}</p></div></div><div className="form-row"><span /><button className="button" disabled={pending} type="submit">{pending ? "保存中…" : template ? "更新" : "テンプレートを追加"}</button></div><ActionMessage state={state} /></form>;
}

export function TemplateSettings({ templates }: { templates: Template[] }) {
  return <section className="card settings-section"><div className="eyebrow">投稿文</div><h2>投稿テンプレート</h2><div className="stack">{templates.map((template) => <TemplateForm key={template.id} template={template} />)}<TemplateForm /></div></section>;
}
