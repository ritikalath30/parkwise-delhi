import { describe, expect, it } from "vitest";
import { parseTripRules } from "@/lib/ai/rules";
import { parseTrip } from "@/lib/ai/parse.server";

describe("trip parser fallback", () => {
  it("extracts place, time, duration, preference and walk", () => {
    expect(parseTripRules("Dinner near Khan Market at 8 for 2 hours, free parking, short walk")).toEqual({
      place: "Khan Market", time: "20:00", hours: 2, budget: null, walk: 300, pref: "free",
    });
  });
  it("handles budgets, metres and am/pm", () => {
    expect(parseTripRules("lunch in Connaught Place at 1:30 pm, under ₹100, max 500 m walk")).toMatchObject({
      place: "Connaught Place", time: "13:30", budget: 100, walk: 500,
    });
  });
  it("uses the rules parser (labelled) when no AI key is configured", async () => {
    const r = await parseTrip("coffee near Hauz Khas Village at 6 pm");
    expect(r.source).toBe("rules");
    expect(r.note).toMatch(/AI not configured/);
    expect(r.place).toBe("Hauz Khas Village");
  });
});

import { localGeocode } from "@/lib/places/server";
describe("local Delhi place search", () => {
  it("finds key areas instantly without any network", () => {
    for (const q of ["Khan Market", "Connaught Place", "Lajpat Nagar", "Saket", "Karol Bagh", "hauz khas"]) {
      const r = localGeocode(q);
      expect(r.length, q).toBeGreaterThan(0);
      expect(r[0]!.lat).toBeGreaterThan(28.4);
    }
  });
  it("also finds restaurants by name", () => {
    expect(localGeocode("Haldiram").some((r) => r.kind === "restaurant")).toBe(true);
  });
});
