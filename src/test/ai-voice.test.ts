import { it, expect } from "vitest";
import { parseTripRules } from "@/lib/ai/rules";
it("spoken plan", () => {
  const i = parseTripRules("Find parking near a restaurant in Bandra, Mumbai for two hours. I prefer paid parking, and my budget is 150 rupees");
  expect(i.place).toBe("Bandra, Mumbai");
  expect(i.hours).toBe(2);
  expect(i.budget).toBe(150);
});
