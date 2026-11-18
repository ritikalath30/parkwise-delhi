import { describe, expect, it } from "vitest";
import { ruleBasedExplanation } from "@/lib/explain";
import { toCriteria } from "@/lib/search";

describe("rank explanations", () => {
  it("explains the first, second and third place", () => {
    const ex = ruleBasedExplanation(toCriteria({ area: "hkv", time: "19:30", day: "weekend", hours: 2, budget: 150, walk: 600 }));
    expect(ex.picks).toHaveLength(3);
    expect(ex.picks[0]!.rankReason).toMatch(/^Ranked #1/);
    expect(ex.picks[1]!.rankReason).toMatch(/#2/);
    expect(ex.picks[2]!.rankReason).toMatch(/#3/);
  });
});
