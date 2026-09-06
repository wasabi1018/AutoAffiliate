import { describe, expect, it } from "vitest";

import { nextRetryStatus, retryDelaySeconds } from "@/lib/jobs/retry";

describe("job retry policy", () => {
  it("uses bounded exponential backoff", () => {
    expect(retryDelaySeconds(1)).toBe(60);
    expect(retryDelaySeconds(2)).toBe(120);
    expect(retryDelaySeconds(10)).toBe(3600);
  });

  it("moves the final failed attempt to dead letter", () => {
    expect(nextRetryStatus(2, 3)).toBe("queued");
    expect(nextRetryStatus(3, 3)).toBe("dead_letter");
  });
});
