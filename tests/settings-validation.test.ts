import { describe, expect, it } from "vitest";

import { accountSchema, parseWeekdays, strategySchema, validateTemplateVariables } from '@/lib/settings/validation';
import { findRakutenGenre } from '@/lib/rakuten-genres';

describe("settings validation", () => {
  it("accepts only the documented template variables", () => {
    expect(validateTemplateVariables("{{product_name}} {{price}} {{pr}}").ok).toBe(true);
    expect(validateTemplateVariables("{{unknown_variable}}").ok).toBe(false);
  });

  it("requires strategy weights to total 100 percent", () => {
    expect(strategySchema.safeParse({ ranking_weight: 60, sale_weight: 20, trending_weight: 20 }).success).toBe(true);
    expect(strategySchema.safeParse({ ranking_weight: 60, sale_weight: 20, trending_weight: 10 }).success).toBe(false);
  });

  it("normalizes and bounds weekday input", () => {
    expect(parseWeekdays("5, 1, 5, 9, -1, 0")).toEqual([0, 1, 5]);
  });

  it('requires a positive Rakuten genre and staged operation mode', () => {
    const base = { display_name: '美容アカウント', handle: 'beauty', genre_id: '100939', operation_mode: 'semi_auto', status: 'active' };
    expect(accountSchema.safeParse(base).success).toBe(true);
    expect(accountSchema.safeParse({ ...base, genre_id: '' }).success).toBe(false);
    expect(accountSchema.safeParse({ ...base, operation_mode: 'unsafe' }).success).toBe(false);
    expect(findRakutenGenre(100939)?.[1]).toBe('美容・コスメ・香水');
  });
});
