import { z } from "zod";

export const ALLOWED_TEMPLATE_VARIABLES = [
  "product_name",
  "price",
  "affiliate_url",
  "genre",
  "display_name",
  "pr",
] as const;

const percentage = z.coerce.number().finite().min(0).max(100);

export const accountSchema = z.object({
  id: z.string().uuid().optional(),
  display_name: z.string().trim().min(1).max(80),
  handle: z.string().trim().regex(/^[A-Za-z0-9._]{1,30}$/, "Threadsユーザーネームの形式が不正です"),
  genre_id: z.coerce.number().int().positive(),
  operation_mode: z.enum(['semi_auto', 'auto']),
  status: z.enum(["active", "paused", "disabled"]),
});

export const strategySchema = z.object({
  ranking_weight: percentage,
  sale_weight: percentage,
  trending_weight: percentage,
}).refine((values) => values.ranking_weight + values.sale_weight + values.trending_weight === 100, {
  message: "戦略の合計は100%にしてください",
});

export const filterSchema = z.object({
  min_price: z.coerce.number().finite().min(0),
  max_price: z.union([z.literal(""), z.coerce.number().finite().min(0)]),
  require_in_stock: z.boolean(),
  min_review_count: z.coerce.number().int().min(0),
  excluded_words: z.string(),
}).refine((values) => values.max_price === "" || values.max_price >= values.min_price, {
  message: "上限価格は下限価格以上にしてください",
  path: ["max_price"],
});

export const templateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  template_type: z.enum(["hook", "reply"]),
  body: z.string().trim().min(1).max(1000),
  active: z.boolean(),
});

export const scheduleSchema = z.object({
  account_id: z.string().uuid(),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1),
  posting_times: z.array(z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "時刻はHH:MM形式で入力してください")).min(1),
  timezone: z.string().trim().min(1).max(80),
  enabled: z.boolean(),
});

export const operationsSchema = z.object({
  dry_run: z.boolean(),
  live_posting_enabled: z.boolean(),
  auto_posting_enabled: z.boolean(),
  global_stop: z.boolean(),
  emergency_stop: z.boolean(),
});

export type ActionState = { ok: boolean; message: string };

export function validateTemplateVariables(body: string) {
  const variables = [...body.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].map((match) => match[1]);
  const unknown = [...new Set(variables.filter((variable) => !(ALLOWED_TEMPLATE_VARIABLES as readonly string[]).includes(variable)))];
  if (unknown.length > 0) {
    return { ok: false as const, message: `未許可のテンプレート変数: ${unknown.map((variable) => `{{${variable}}}`).join(", ")}` };
  }
  return { ok: true as const, variables };
}

export function parseList(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

export function parseWeekdays(value: string) {
  return [...new Set(value.split(",").map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item >= 0 && item <= 6))].sort((a, b) => a - b);
}
