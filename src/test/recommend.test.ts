import { describe, expect, it } from "vitest";
import { evaluateArea, minFreeSpots, topRecommendations } from "@/lib/engine";
import { suggestFixes, toCriteria } from "@/lib/search";

const base = toCriteria({ area: "hkv", time: "20:00", day: "weekend", hours: 2, budget: 150, walk: 600 });

describe("ParkWise recommendation rules", () => {
  it("never recommends unverified parking", () => {
    const ev = evaluateArea({ ...base, budget: 400, walk: 1500 });
    const ids = ev.restaurants.flatMap((r) => r.options.map((o) => o.park.parking.id));
    expect(ids).not.toContain("hkv-x-roadside");
    expect(ids).not.toContain("hkv-x-towaway");
    expect(ev.excludedUnverified).toBe(2);
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

  it("prices a 2-hour stay at HKV main gate as first hour plus one extra hour (₹60 + ₹40)", () => {
    const ev = evaluateArea(base);
    expect(ev.parkings.find((p) => p.parking.id === "hkv-p-gate")!.cost).toBe(100);
  });
});

describe("ParkWise data consistency", () => {
  const times = ["09:00", "13:00", "19:30", "21:00"];
  const areas = ["hkv", "khan", "cp"];

  it("keeps free spots, capacity and availability % in agreement", () => {
    for (const area of areas)
      for (const time of times) {
        const ev = evaluateArea(toCriteria({ area, time, day: "weekend", hours: 2, budget: 400, walk: 1500 }));
        for (const p of ev.parkings) {
          expect(p.freeSpots).toBeLessThanOrEqual(p.parking.capacity);
          expect(p.availabilityPct).toBe(p.open ? Math.round((p.freeSpots / p.parking.capacity) * 100) : 0);
        }
      }
  });

  it("gives busier facilities a longer or equal search time", () => {
    const ev = evaluateArea(base);
    const open = ev.parkings.filter((p) => p.open).sort((a, b) => a.occupancy - b.occupancy);
    for (let i = 1; i < open.length; i++) expect(open[i]!.searchMin).toBeGreaterThanOrEqual(open[i - 1]!.searchMin);
  });

  it("keeps every score between 0 and 100 and ranks picks best-first", () => {
    const rec = topRecommendations({ ...base, budget: 400, walk: 1500 });
    const scores = rec.top.map((r) => r.best!.score);
    for (const s of scores) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(100);
    }
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it("rejects parking that closes before the stay ends", () => {
    // Deer Park Gate closes at 22:00; a 3 h stay from 20:00 must not use it
    const ev = evaluateArea(toCriteria({ area: "hkv", time: "20:00", day: "weekend", hours: 3, budget: 400, walk: 1500 }));
    const deer = ev.parkings.find((p) => p.parking.id === "hkv-p-deer")!;
    expect(deer.open).toBe(false);
    for (const r of ev.restaurants) expect(r.best?.park.parking.id).not.toBe("hkv-p-deer");
  });

  it("changes availability when arrival time changes", () => {
    const morning = evaluateArea(toCriteria({ area: "hkv", time: "10:00", day: "weekend", hours: 2, budget: 150, walk: 600 }));
    const evening = evaluateArea(toCriteria({ area: "hkv", time: "20:00", day: "weekend", hours: 2, budget: 150, walk: 600 }));
    const gate = (e: typeof morning) => e.parkings.find((p) => p.parking.id === "hkv-p-gate")!.availabilityPct;
    expect(gate(morning)).toBeGreaterThan(gate(evening));
  });
});

describe("parking preference", () => {
  it("free-only recommends only verified ₹0 parking", () => {
    const offPeak = toCriteria({ area: "hkv", time: "13:00", day: "weekday", hours: 2, budget: 150, walk: 1500, pref: "free" });
    const rec = topRecommendations(offPeak);
    expect(rec.top.length).toBeGreaterThan(0);
    for (const r of rec.top) {
      expect(r.best!.park.cost).toBe(0);
      expect(r.best!.park.parking.access).toBe("free");
    }
  });

  it("only recommends authorised or owner-permitted shared parking", () => {
    for (const pref of ["free", "both", "paid"] as const) {
      const rec = topRecommendations({ ...base, pref, budget: 400, walk: 1500 });
      for (const r of rec.top) expect(["authorised", "shared-permission"]).toContain(r.best!.park.parking.authorisation);
    }
  });

  it("changes the score when the preference changes", () => {
    const a = topRecommendations({ ...base, pref: "both" }).top[0]!.best!.score;
    const b = topRecommendations({ ...base, pref: "paid" }).top[0]!.best!.score;
    expect(a).not.toBe(b);
  });

  it("reports straight-line distance no greater than the estimated walking route", () => {
    for (const r of evaluateArea(base).restaurants) for (const o of r.options) expect(o.straightM).toBeLessThanOrEqual(o.walkM);
  });
});

describe("availability floor", () => {
  it("never recommends a facility expected to be nearly full", () => {
    for (const area of ["hkv", "khan", "cp"])
      for (const time of ["09:00", "13:00", "19:30", "20:00", "21:00"])
        for (const pref of ["free", "both", "paid"] as const) {
          const rec = topRecommendations(toCriteria({ area, time, day: "weekend", hours: 2, budget: 400, walk: 1500, pref }));
          for (const r of rec.top) expect(r.best!.park.freeSpots).toBeGreaterThanOrEqual(minFreeSpots(r.best!.park.parking));
        }
  });

  it("explains why a nearly full facility was rejected", () => {
    const ev = evaluateArea({ ...base, pref: "free", walk: 1500 });
    const fort = ev.restaurants[0]!.options.find((o) => o.park.parking.id === "hkv-f-fort")!;
    expect(fort.eligible).toBe(false);
    expect(fort.blockers).toContain("full");
    expect(fort.issues.join(" ")).toMatch(/Nearly full|full/);
  });
});

describe("dynamic recommendations", () => {
  const key = (c: Parameters<typeof topRecommendations>[0]) =>
    topRecommendations(c).top.map((r) => `${r.restaurant.id}:${r.best!.park.parking.id}:${r.best!.score}`).join("|");
  const c0 = toCriteria({ area: "hkv", time: "13:00", day: "weekday", hours: 2, budget: 150, walk: 600, pref: "both" });

  it("changes when preference, budget, arrival time or walking limit change", () => {
    expect(key({ ...c0, pref: "free", walk: 1500 })).not.toBe(key(c0));
    expect(key({ ...c0, budget: 30 })).not.toBe(key(c0));
    expect(key({ ...c0, arrival: 20 * 60 })).not.toBe(key(c0));
    expect(key({ ...c0, walk: 250 })).not.toBe(key(c0));
  });
});

describe("fix suggestions", () => {
  it("only suggests changes that actually produce results", () => {
    const s = { area: "hkv", time: "23:00", day: "weekend", hours: 2, budget: 150, walk: 600, pref: "both" };
    const fixes = suggestFixes(s);
    expect(fixes.length).toBeGreaterThan(0);
    for (const f of fixes) expect(topRecommendations(toCriteria({ ...s, ...f.patch })).rankedCount).toBeGreaterThan(0);
  });

  it("every homepage-style preset returns at least one restaurant", () => {
    const presets = [
      { area: "hkv", time: "20:00", day: "weekend", hours: 2, budget: 150, walk: 600, pref: "both" },
      { area: "khan", time: "13:00", day: "weekday", hours: 1, budget: 80, walk: 800, pref: "free" },
      { area: "cp", time: "11:00", day: "weekend", hours: 2, budget: 100, walk: 800, pref: "paid" },
    ];
    for (const p of presets) expect(topRecommendations(toCriteria(p)).top.length).toBeGreaterThan(0);
  });
});
