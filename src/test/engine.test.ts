import { describe, expect, it } from "vitest";
import fixture from "./fixtures/osm-test-area.json";
import { availabilityFor, PROVIDERS, UNKNOWN } from "@/lib/availability";
import { evaluate, routeKey, suggestFixes, type Criteria, type EngineInput } from "@/lib/engine";
import { normaliseOverpass, type OsmElement } from "@/lib/places/osm";

const center = { lat: 28.5539, lng: 77.1942 };
const n = normaliseOverpass(fixture.elements as OsmElement[], center);
const data: EngineInput = { center, ...n, routes: null };
// 2026-11-21 is a Saturday, 2026-11-18 a Wednesday
const c = (o: Partial<Criteria> = {}): Criteria => ({ dateISO: "2026-11-21", arrival: 19 * 60 + 30, hours: 2, budget: 150, walk: 600, pref: "both", ...o });
const combos = (cr: Criteria) =>
  evaluate(data, cr).restaurants.flatMap((r) => r.options.filter((o) => o.eligible).map((o) => `${r.restaurant.id}>${o.parking.id}`)).sort();
const top = (cr: Criteria) => evaluate(data, cr).top.map((r) => `${r.restaurant.name}@${r.best!.parking.name}`);

describe("data from the fixture", () => {
  it("never offers private, customers-only or unmarked roadside parking", () => {
    const names = n.parkings.map((p) => p.name);
    expect(names).not.toContain("Test Private Lot");
    expect(names).not.toContain("Test Customers Lot");
    expect(n.excluded.length).toBe(3);
    expect(n.restaurants.find((r) => !r.name)).toBeUndefined();
  });
});

describe("eligibility before ranking", () => {
  it("Free only returns exclusively free parking", () => {
    for (const r of evaluate(data, c({ pref: "free", walk: 1500 })).restaurants)
      for (const o of r.options) if (o.eligible) expect(o.parking.category).toBe("free");
  });
  it("Paid excludes free parking; Both includes everything public", () => {
    for (const r of evaluate(data, c({ pref: "paid", walk: 1500, budget: 400 })).restaurants)
      for (const o of r.options) if (o.eligible) expect(o.parking.category).not.toBe("free");
    expect(combos(c({ pref: "both", walk: 1500, budget: 400 })).length).toBeGreaterThan(combos(c({ pref: "paid", walk: 1500, budget: 400 })).length);
  });
  it("a ₹50 budget excludes every option with a known cost over ₹50", () => {
    for (const r of evaluate(data, c({ budget: 50, walk: 1500 })).restaurants)
      for (const o of r.options) if (o.cost !== null && o.cost > 50) expect(o.eligible).toBe(false);
    expect(combos(c({ budget: 50, walk: 1500 }))).not.toEqual(combos(c({ budget: 400, walk: 1500 })));
  });
  it("a 200 m walking limit excludes facilities beyond 200 m", () => {
    for (const r of evaluate(data, c({ walk: 200 })).restaurants) for (const o of r.options) if (o.walkM > 200) expect(o.eligible).toBe(false);
  });
  it("uses the OSM walking route over the estimate when available", () => {
    const r = n.restaurants[0]!;
    const p = n.parkings[0]!;
    const ev = evaluate({ ...data, routes: { [routeKey(p.id, r.id)]: 1400 } }, c({ walk: 1500 }));
    const o = ev.restaurants.find((x) => x.restaurant.id === r.id)!.options.find((x) => x.parking.id === p.id)!;
    expect(o.walkSource).toBe("route");
    expect(o.walkM).toBe(1400);
  });
  it("duration changes charges: ₹20/hour costs ₹40 for 2 h and ₹80 for 4 h", () => {
    const cost = (hours: number) => evaluate(data, c({ hours, walk: 1500, budget: 400 })).restaurants[0]!.options.find((o) => o.parking.name === "Test Paid Hourly")!.cost;
    expect(cost(2)).toBe(40);
    expect(cost(4)).toBe(80);
  });
  it("unknown prices are never invented", () => {
    const o = evaluate(data, c()).restaurants[0]!.options.find((x) => x.parking.name === "Test Paid No Price")!;
    expect(o.cost).toBeNull();
    expect(o.costLabel).toBe("Paid · price unavailable");
  });
  it("respects parking opening hours for the whole stay", () => {
    // Test Free Lot is open 06:00–22:00: a 21:00 + 2 h stay does not fit
    const o = evaluate(data, c({ arrival: 21 * 60, walk: 1500 })).restaurants[0]!.options.find((x) => x.parking.name === "Test Free Lot")!;
    expect(o.openForStay).toBe(false);
    expect(o.eligible).toBe(false);
  });
  it("does not recommend restaurants known to be closed at arrival", () => {
    const ev = evaluate(data, c({ arrival: 20 * 60 }));
    const breakfast = ev.restaurants.find((r) => r.restaurant.name === "Test Breakfast Club")!;
    expect(breakfast.openAtArrival).toBe(false);
    expect(breakfast.eligible).toBe(false);
    expect(ev.top.map((r) => r.restaurant.name)).not.toContain("Test Breakfast Club");
  });
});

describe("dynamic and deterministic", () => {
  it("recommendations change when preference, budget, time or walk limit change", () => {
    const base = c({ walk: 400 });
    expect(top({ ...base, pref: "free" })).not.toEqual(top(base));
    expect(combos({ ...base, budget: 30 })).not.toEqual(combos(base));
    expect(combos({ ...base, walk: 150 })).not.toEqual(combos(base));
    const avail = (cr: Criteria) => evaluate(data, cr).restaurants[0]!.options.map((o) => o.availability.level);
    expect(avail(c({ arrival: 9 * 60, dateISO: "2026-11-18" }))).not.toEqual(avail(c({ arrival: 20 * 60 })));
  });
  it("same inputs give identical results", () => {
    expect(JSON.stringify(evaluate(data, c()))).toBe(JSON.stringify(evaluate(data, c())));
  });
});

describe("plain-language tags", () => {
  it("tags exactly one best match, and cheapest/shortest walk where they apply", () => {
    for (const r of evaluate(data, c({ walk: 1500, budget: 400 })).restaurants) {
      const el = r.options.filter((o) => o.eligible);
      if (!el.length) continue;
      expect(el.filter((o) => o.tags.includes("best-match"))).toHaveLength(1);
      const cheapest = el.find((o) => o.tags.includes("cheapest"));
      if (cheapest) for (const o of el) if (o.cost !== null) expect(cheapest.cost!).toBeLessThanOrEqual(o.cost);
    }
  });
});

describe("availability providers", () => {
  it("LIVE and IMAGE ESTIMATE are not operational and produce nothing; PREDICTED is labelled simulated", () => {
    expect(PROVIDERS.find((p) => p.kind === "live")!.status).toBe("awaiting-integration");
    expect(PROVIDERS.find((p) => p.kind === "image-estimate")!.status).toBe("experimental");
    const a = availabilityFor(n.parkings[0]!, { dateISO: "2026-11-21", arrivalMin: 1200, hours: 2, activityCount: 80 });
    expect(a.kind).toBe("predicted");
    expect(a.simulated).toBe(true);
    expect(availabilityFor(n.parkings[0]!, { dateISO: "2026-11-21", arrivalMin: 1200, hours: 2, activityCount: 80 }, [])).toEqual(UNKNOWN);
  });
});

describe("grid: no recommendation ever breaks a filter", () => {
  it("across times, days, durations, budgets, walks and preferences", () => {
    for (const dateISO of ["2026-11-18", "2026-11-21"])
      for (const arrival of [8 * 60, 13 * 60, 19 * 60 + 30, 22 * 60 + 30])
        for (const hours of [1, 3])
          for (const budget of [20, 50, 150, 400])
            for (const walk of [150, 400, 1500])
              for (const pref of ["free", "paid", "both"] as const) {
                const cr = { dateISO, arrival, hours, budget, walk, pref };
                for (const r of evaluate(data, cr).top) {
                  const o = r.best!;
                  expect(o.walkM).toBeLessThanOrEqual(walk);
                  if (o.cost !== null) expect(o.cost).toBeLessThanOrEqual(budget);
                  if (pref === "free") expect(o.parking.category).toBe("free");
                  if (pref === "paid") expect(o.parking.category).not.toBe("free");
                  expect(o.openForStay).not.toBe(false);
                  expect(r.openAtArrival).not.toBe(false);
                }
              }
  });
  it("fix suggestions only offer changes that produce results", () => {
    const cr = c({ pref: "free", walk: 100 });
    for (const f of suggestFixes(data, cr)) expect(evaluate(data, { ...cr, ...f.patch }).top.length).toBeGreaterThan(0);
  });
});

import { isReliable } from "@/lib/engine";
describe("reliability gate", () => {
  it("rejects lots with no recorded access, fee, name or operator", () => {
    const base = { accessTag: null, fee: "unknown", name: null, operator: null } as never;
    expect(isReliable(base)).toBe(false);
    expect(isReliable({ ...(base as object), fee: "no" } as never)).toBe(true);
    expect(isReliable({ ...(base as object), accessTag: "public" } as never)).toBe(true);
  });
});
