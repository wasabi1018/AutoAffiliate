import { describe, expect, it } from "vitest";

import { getPublicEnv } from "@/lib/env";

describe("public environment", () => {
  it("accepts the required browser-safe Supabase values", () => {
    expect(getPublicEnv({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
    })).toEqual({
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "local-publishable-key",
    });
  });

  it("rejects missing or malformed values", () => {
    expect(() => getPublicEnv({ NEXT_PUBLIC_SUPABASE_URL: "not-a-url" })).toThrow();
  });
});
