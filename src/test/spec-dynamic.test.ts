import { describe, expect, it } from "vitest";
import { AREA_LIST } from "@/lib/data";
import { evaluateArea, isRecommendable, minFreeSpots, parkingCost, routeKey, topRecommendations, type Criteria } from "@/lib/engine";
import { ruleBasedExplanation } from "@/lib/explain";
import { evaluateSafety } from "@/lib/safety";
import { toCriteria } from "@/lib/search";

const c = (o: Partial<Record<string, string | number>> = {}): Criteria =>
  toCriteria({ area: "hkv", time: "19:30", day: "weekend", hours: 2, budget: 150, walk: 600, pref: "both", ...o } as never);
const eligibleIds = (cr: Criteria) =>
  evaluateArea(cr).restaurants.flatMap((r) => r.options.filter((o) => o.eligible).map((o) => `${r.restaurant.id}>${o.park.parking.id}`)).sort();
const top = (cr: Criteria) => topRecommendations(cr).top.map((r) => `${r.restaurant.id}@${r.best!.park.parking.id}`);

describe("budget is a real filter applied before ranking", () => {
  it("changing the budget changes the eligible restaurant–parking combinations", () => {
    expect(eligibleIds(c({ budget: 50 }))).not.toEqual(eligibleIds(c({ budget: 400 })));
  });

  it("raising the budget unlocks a pricier, better facility and changes the ranking", () => {
    for (const area of ["hkv", "khan", "cp"]) {
      const low = top(c({ area, budget: 60 }));
      const high = top(c({ area, budget: 400 }));
      expect(high, area).not.toEqual(low);
      expect(high.some((t) => t.includes("-p-premium")), area).toBe(true);
    }
  });

  it("never recommends an option over budget", () => {
    for (const area of ["hkv", "khan", "cp"])
      for (const budget of [20, 50, 60, 100, 150, 250, 400])
        for (const r of topRecommendations(c({ area, budget })).top) expect(r.best!.park.cost).toBeLessThanOrEqual(budget);
  });

  it("budget does not rescale scores of options that stay eligible", () => {
    const a = topRecommendations(c({ budget: 150 })).top[0]!;
    const b = topRecommendations(c({ budget: 400 })).restaurants.find((r) => r.restaurant.id === a.restaurant.id)!;
    const same = b.options.find((o) => o.park.parking.id === a.best!.park.parking.id)!;
    expect(same.score).toBe(a.best!.score);
  });

  it("₹50 budget excludes every facility costing more than ₹50 for the stay", () => {
    for (const r of evaluateArea(c({ budget: 50 })).restaurants)
      for (const o of r.options) if (o.park.cost > 50) expect(o.eligible).toBe(false);
  });
});

describe("other inputs", () => {
  it("free-only excludes all paid and shared parking", () => {
    for (const area of ["hkv", "khan", "cp"])
      for (const time of ["09:00", "13:00", "19:30"]) {
        const ev = evaluateArea(c({ area, time, pref: "free", walk: 1500, budget: 400 }));
        for (const r of ev.restaurants) for (const o of r.options) if (o.eligible) expect(o.park.cost).toBe(0);
      }
  });

  it("walking limit filters options by walking distance", () => {
    const ev = evaluateArea(c({ walk: 300, budget: 400 }));
    for (const r of ev.restaurants) for (const o of r.options) if (o.walkM > 300) expect(o.eligible).toBe(false);
    expect(eligibleIds(c({ walk: 300, budget: 400 })).length).toBeLessThan(eligibleIds(c({ walk: 1500, budget: 400 })).length);
  });

  it("uses OSM route distance over the estimate when route data exists", () => {
    const base = evaluateArea(c({ walk: 300 }));
    const r = base.restaurants.find((x) => x.eligible)!;
    const o = r.best!;
    expect(o.walkSource).toBe("estimate");
    const routes = { [routeKey(o.park.parking.id, r.restaurant.id)]: 900 };
    const withRoute = evaluateArea(c({ walk: 300 }), routes)
      .restaurants.find((x) => x.restaurant.id === r.restaurant.id)!
      .options.find((x) => x.park.parking.id === o.park.parking.id)!;
    expect(withRoute.walkSource).toBe("route");
    expect(withRoute.walkM).toBe(900);
    expect(withRoute.eligible).toBe(false);
    expect(withRoute.issues.join(" ")).toMatch(/OSM route/);
  });

  it("never reports a walking route shorter than the straight line", () => {
    const r = evaluateArea(c()).restaurants[0]!;
    const o = r.options[0]!;
    const ev = evaluateArea(c(), { [routeKey(o.park.parking.id, r.restaurant.id)]: 5 });
    const w = ev.restaurants[0]!.options.find((x) => x.park.parking.id === o.park.parking.id)!;
    expect(w.walkSource).toBe("route");
    expect(w.walkM).toBeGreaterThanOrEqual(w.straightM);
  });

  it("arrival time changes simulated availability", () => {
    const pct = (time: string) => evaluateArea(c({ time })).parkings.map((p) => p.availabilityPct);
    expect(pct("10:00")).not.toEqual(pct("20:00"));
  });

  it("is deterministic — same inputs give the same results", () => {
    expect(JSON.stringify(topRecommendations(c()))).toBe(JSON.stringify(topRecommendations(c())));
  });

  it("duration changes parking charges", () => {
    const cost = (hours: number) => evaluateArea(c({ hours })).parkings.find((p) => p.parking.id === "hkv-p-gate")!.cost;
    expect(cost(1)).toBe(60);
    expect(cost(3)).toBe(140);
    for (const p of AREA_LIST[0]!.parkings) expect(parkingCost(p, 4)).toBeGreaterThanOrEqual(parkingCost(p, 1));
  });
});

describe("safety", () => {
  it("scores 0–100 with consistent bands, the same everywhere", () => {
    for (const area of AREA_LIST)
      for (const p of area.parkings) {
        const s = evaluateSafety(p);
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(100);
        expect(s.band).toBe(s.score >= 70 ? "high" : s.score >= 45 ? "moderate" : "limited");
      }
    const a = evaluateArea(c({ time: "10:00" })).parkings.map((p) => p.safety.score);
    const b = evaluateArea(c({ time: "21:00", budget: 400 })).parkings.map((p) => p.safety.score);
    expect(a).toEqual(b);
  });

  it("a high safety score never makes unauthorised or unverified parking eligible", () => {
    for (const area of AREA_LIST)
      for (const p of area.parkings.filter((x) => !isRecommendable(x))) {
        const ev = evaluateArea(c({ area: area.id, budget: 400, walk: 1500 }));
        expect(ev.parkings.map((x) => x.parking.id)).not.toContain(p.id);
      }
  });

  it("safety contributes to ranking", () => {
    const o = topRecommendations(c()).top[0]!.best!;
    expect(o.weights.safety).toBeGreaterThan(0);
    expect(o.breakdown.safety).toBeCloseTo(o.park.safety.score / 100);
  });
});

describe("no recommendation violates any constraint (grid)", () => {
  it("authorisation, budget, walk, preference, opening hours and availability floor", () => {
    for (const area of ["hkv", "khan", "cp"])
      for (const time of ["08:00", "12:00", "16:00", "19:30", "21:30", "23:00"])
        for (const day of ["weekday", "weekend"])
          for (const hours of [1, 2, 4])
            for (const budget of [30, 60, 150, 400])
              for (const walk of [200, 600, 1500])
                for (const pref of ["free", "both", "paid"]) {
                  const cr = c({ area, time, day, hours, budget, walk, pref });
                  const rec = topRecommendations(cr);
                  expect(rec.top.length).toBeLessThanOrEqual(3);
                  for (const r of rec.top) {
                    const o = r.best!;
                    expect(isRecommendable(o.park.parking)).toBe(true);
                    expect(o.park.cost).toBeLessThanOrEqual(cr.budget);
                    expect(o.walkM).toBeLessThanOrEqual(cr.walk);
                    if (cr.pref === "free") expect(o.park.cost).toBe(0);
                    expect(o.park.open).toBe(true);
                    expect(o.park.freeSpots).toBeGreaterThanOrEqual(minFreeSpots(o.park.parking));
                  }
                  if (rec.top.length === 0) expect(ruleBasedExplanation(cr).picks).toHaveLength(0);
                }
  });
});
