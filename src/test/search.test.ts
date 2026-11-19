import { describe, expect, it } from "vitest";
import { cleanSearch, criteriaPatchToSearch, toCriteria } from "@/lib/search";

describe("search params", () => {
  it("resolves legacy ?area= links to real coordinates", () => {
    expect(cleanSearch({ area: "khan" })).toMatchObject({ q: "Khan Market, New Delhi", lat: 28.6001, lng: 77.2265 });
  });
  it("clamps and validates inputs", () => {
    const s = cleanSearch({ lat: 28.6, lng: 77.2, time: "25:99", hours: 99, budget: 5, walk: 99999, pref: "x", date: "nope" });
    expect(s).toMatchObject({ time: "23:59", hours: 8, budget: 20, walk: 1500, pref: "both", date: "" });
  });
  it("converts to engine criteria and back", () => {
    const c = toCriteria({ lat: 1, lng: 1, time: "19:30", date: "2026-11-21" });
    expect(c).toMatchObject({ dateISO: "2026-11-21", arrival: 1170 });
    expect(criteriaPatchToSearch({ arrival: 1110, walk: 900 })).toEqual({ time: "18:30", walk: 900 });
  });
});
