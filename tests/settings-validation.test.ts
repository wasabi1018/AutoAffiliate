import { describe, expect, it } from "vitest";

import { parseWeekdays, strategySchema, validateTemplateVariables } from "@/lib/settings/validation";

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
});
