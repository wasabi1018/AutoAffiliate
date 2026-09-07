import { describe, expect, it } from "vitest";

import { formatPostingTime, formatPostingTimes } from "@/lib/settings/time";

describe("posting time formatting", () => {
  it("removes seconds from database time values", () => {
    expect(formatPostingTime("20:00:00")).toBe("20:00");
    expect(formatPostingTimes(["06:00:00", "18:00:00", "20:00:00"])).toBe("06:00,18:00,20:00");
  });

  it("keeps an existing HH:MM value unchanged", () => {
    expect(formatPostingTime("20:00")).toBe("20:00");
  });
});
