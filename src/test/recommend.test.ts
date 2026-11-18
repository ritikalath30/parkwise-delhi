import { describe, expect, it } from "vitest";
import { evaluateArea, topRecommendations } from "@/lib/engine";
import { toCriteria } from "@/lib/search";

const base = toCriteria({ area: "hkv", time: "20:00", day: "weekend", hours: 2, budget: 150, walk: 600 });

describe("ParkWise recommendation rules", () => {
  it("never recommends unverified parking", () => {
    const ev = evaluateArea({ ...base, budget: 400, walk: 1500 });
    const ids = ev.restaurants.flatMap((r) => r.options.map((o) => o.park.parking.id));
    expect(ids).not.toContain("hkv-x-roadside");
    expect(ev.excludedUnverified).toBe(1);
  });

  it("returns at most three recommendations", () => {
    expect(topRecommendations({ ...base, budget: 400, walk: 1500 }, 3).top.length).toBe(3);
  });

  it("excludes parking that costs more than the budget", () => {
    const rec = topRecommendations({ ...base, budget: 50 });
    for (const r of rec.top) expect(r.best!.park.cost).toBeLessThanOrEqual(50);
  });

  it("excludes parking beyond the maximum walking distance", () => {
    const rec = topRecommendations({ ...base, walk: 300 });
    for (const r of rec.top) expect(r.best!.walkM).toBeLessThanOrEqual(300);
  });

  it("prices a 2-hour stay at HKV main gate as first hour plus one extra hour", () => {
    const ev = evaluateArea(base);
    expect(ev.parkings.find((p) => p.parking.id === "hkv-p-gate")!.cost).toBe(100);
  });
});
