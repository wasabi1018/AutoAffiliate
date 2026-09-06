import { describe, expect, it } from "vitest";
import { rakutenItems } from "../supabase/functions/_shared/rakuten";

describe("rakutenItems", () => {
  it("accepts the documented formatVersion=2 response", () => {
    expect(rakutenItems({ items: [{ itemName: "A" }] })).toEqual([{ itemName: "A" }]);
  });

  it("unwraps the legacy Items and Item response", () => {
    expect(rakutenItems({ Items: [{ Item: { itemName: "A" } }] })).toEqual([{ itemName: "A" }]);
  });

  it("accepts an items array nested under data", () => {
    expect(rakutenItems({ data: { items: [{ itemName: "A" }] } })).toEqual([{ itemName: "A" }]);
  });
});
