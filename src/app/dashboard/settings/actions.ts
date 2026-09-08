"use server";

import { revalidatePath } from "next/cache";

import { createClient } from '@/lib/supabase/server';
import { findRakutenGenre } from '@/lib/rakuten-genres';
import {
  accountSchema,
  filterSchema,
  operationsSchema,
  parseList,
  parseWeekdays,
  scheduleSchema,
  strategySchema,
  templateSchema,
  validateTemplateVariables,
  type ActionState,
} from "@/lib/settings/validation";

const initialError: ActionState = { ok: false, message: "入力内容を確認してください。" };

async function getAdminClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null };

  const { data: admin } = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  return { supabase, user: admin ? user : null };
}

function fail(error: unknown): ActionState {
  console.error("settings action failed", error);
  return { ok: false, message: "保存に失敗しました。入力内容と権限を確認してください。" };
}

export async function saveAccount(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = accountSchema.safeParse({
    id: formData.get("id") || undefined,
    display_name: formData.get("display_name"),
    handle: formData.get("handle"),
    genre_ids: formData.getAll('genre_ids'),
    operation_mode: formData.get('operation_mode'),
    status: formData.get("status"),
  });
  if (!parsed.success) return initialError;
  const genres = parsed.data.genre_ids.map(findRakutenGenre);
  if (genres.some((genre) => !genre)) return { ok: false, message: '楽天ジャンルを1つ以上選択してください。' };
  const selectedGenres = genres.filter((genre): genre is NonNullable<typeof genre> => genre !== null);
  const primaryGenre = selectedGenres[0];
  const { supabase, user } = await getAdminClient();
  if (!user) return { ok: false, message: "管理者としてログインしてください。" };

  try {
    const values = {
      display_name: parsed.data.display_name,
      handle: parsed.data.handle,
      genre: primaryGenre[1],
      genre_id: primaryGenre[0],
      genres: selectedGenres.map((genre) => genre[1]),
      genre_ids: selectedGenres.map((genre) => genre[0]),
      operation_mode: parsed.data.operation_mode,
      status: parsed.data.status,
      updated_at: new Date().toISOString(),
    };
    const result = parsed.data.id
      ? await supabase.from("threads_accounts").update(values).eq("id", parsed.data.id).select("id").single()
      : await supabase.from("threads_accounts").insert(values).select("id").single();
    if (result.error || !result.data) throw result.error || new Error("account was not saved");
    const history = await supabase.from("threads_account_genre_history").insert(
      selectedGenres.map((genre) => ({ account_id: result.data.id, genre: genre[1], changed_by: user.id })),
    );
    if (history.error) throw history.error;
    revalidatePath("/dashboard/settings");
    return { ok: true, message: parsed.data.id ? "アカウントを更新しました。" : "アカウントを追加しました。" };
  } catch (error) { return fail(error); }
}

export async function saveStrategy(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = strategySchema.safeParse({ ranking_weight: formData.get("ranking_weight"), sale_weight: formData.get("sale_weight"), trending_weight: formData.get("trending_weight") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || "戦略の入力を確認してください。" };
  const { supabase, user } = await getAdminClient();
  if (!user) return { ok: false, message: "管理者としてログインしてください。" };
  try {
    const values = { ...parsed.data, id: true, updated_by: user.id, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("strategy_settings").upsert(values);
    if (error) throw error;
    const history = await supabase.from("strategy_settings_history").insert({ ...parsed.data, changed_by: user.id });
    if (history.error) throw history.error;
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "戦略の重みを保存しました。" };
  } catch (error) { return fail(error); }
}

export async function saveFilters(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = filterSchema.safeParse({ min_price: formData.get("min_price"), max_price: formData.get("max_price"), require_in_stock: formData.get("require_in_stock") === "on", min_review_count: formData.get("min_review_count"), excluded_words: formData.get("excluded_words") });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || "商品フィルターの入力を確認してください。" };
  const { supabase, user } = await getAdminClient();
  if (!user) return { ok: false, message: "管理者としてログインしてください。" };
  try {
    const { error } = await supabase.from("product_filters").upsert({ id: true, min_price: parsed.data.min_price, max_price: parsed.data.max_price === "" ? null : parsed.data.max_price, require_in_stock: parsed.data.require_in_stock, min_review_count: parsed.data.min_review_count, excluded_words: parseList(parsed.data.excluded_words), updated_by: user.id, updated_at: new Date().toISOString() });
    if (error) throw error;
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "商品フィルターを保存しました。" };
  } catch (error) { return fail(error); }
}

export async function saveTemplate(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const body = String(formData.get("body") || "");
  const variableCheck = validateTemplateVariables(body);
  if (!variableCheck.ok) return variableCheck;
  const parsed = templateSchema.safeParse({ id: formData.get("id") || undefined, name: formData.get("name"), template_type: formData.get("template_type"), body, active: formData.get("active") === "on" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || "テンプレートの入力を確認してください。" };
  const { supabase, user } = await getAdminClient();
  if (!user) return { ok: false, message: "管理者としてログインしてください。" };
  try {
    const values = { name: parsed.data.name, template_type: parsed.data.template_type, body: parsed.data.body, active: parsed.data.active, updated_at: new Date().toISOString() };
    const result = parsed.data.id ? await supabase.from("post_templates").update(values).eq("id", parsed.data.id) : await supabase.from("post_templates").insert(values);
    if (result.error) throw result.error;
    revalidatePath("/dashboard/settings");
    return { ok: true, message: parsed.data.id ? "テンプレートを更新しました。" : "テンプレートを追加しました。" };
  } catch (error) { return fail(error); }
}

export async function saveSchedule(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const weekdayValues = formData.getAll("weekdays");
  const weekdays = weekdayValues.length > 1 ? weekdayValues.map(Number).filter((value) => Number.isInteger(value)) : parseWeekdays(String(weekdayValues[0] || ""));
  const parsed = scheduleSchema.safeParse({ account_id: formData.get("account_id"), weekdays, posting_times: parseList(String(formData.get("posting_times") || "")), timezone: formData.get("timezone"), enabled: formData.get("enabled") === "on" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message || "スケジュールの入力を確認してください。" };
  const { supabase, user } = await getAdminClient();
  if (!user) return { ok: false, message: "管理者としてログインしてください。" };
  try {
    const { error } = await supabase.from("posting_schedules").upsert({ ...parsed.data, updated_at: new Date().toISOString() }, { onConflict: "account_id" });
    if (error) throw error;
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "スケジュールを保存しました。" };
  } catch (error) { return fail(error); }
}

export async function saveOperations(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = operationsSchema.safeParse({ dry_run: formData.get('dry_run') === 'on', live_posting_enabled: formData.get('live_posting_enabled') === 'on', auto_posting_enabled: formData.get('auto_posting_enabled') === 'on', global_stop: formData.get('global_stop') === 'on', emergency_stop: formData.get('emergency_stop') === 'on' });
  if (!parsed.success) return initialError;
  const { supabase, user } = await getAdminClient();
  if (!user) return { ok: false, message: "管理者としてログインしてください。" };
  try {
    const { error } = await supabase.from("app_settings").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", true);
    if (error) throw error;
    revalidatePath("/dashboard");
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "停止・投稿モードを保存しました。" };
  } catch (error) { return fail(error); }
}
