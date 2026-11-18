import { describe, expect, it } from "vitest";
import { collectNumbers, numbersGrounded } from "@/lib/explain";

describe("AI explanation number grounding", () => {
  const allowed = collectNumbers({ costRupees: 50, walk: 220, availability: "18% free", reason: "ahead by 12 points" });

  it("accepts text that only uses figures from the facts", () => {
    expect(numbersGrounded("Park for ₹50 and walk 220 m; 18% simulated availability, 12 points ahead.", allowed)).toBe(true);
  });

  it("rejects text that invents a figure", () => {
    expect(numbersGrounded("Only ₹40 for two hours", allowed)).toBe(false);
    expect(numbersGrounded("A 350 m walk", allowed)).toBe(false);
  });

  it("ignores small counts", () => {
    expect(numbersGrounded("Arrive 5 minutes early, 2 hour stay", allowed)).toBe(true);
  });
});
