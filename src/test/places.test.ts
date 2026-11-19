import { describe, expect, it } from "vitest";
import { chargeFor, chargeLabel, parseCharge } from "@/lib/places/charge";
import { coversSpan, isOpenAt, parseOpeningHours, weekdayIndex } from "@/lib/places/hours";
import { normaliseOverpass, polygonAreaM2, toParking, toRestaurant, type OsmElement } from "@/lib/places/osm";

const node = (id: number, tags: Record<string, string>, lat = 28.55, lon = 77.19): OsmElement => ({ type: "node", id, lat, lon, tags });

describe("opening hours", () => {
  it("parses 24/7, weekday rules and past-midnight ranges", () => {
    const h247 = parseOpeningHours("24/7")!;
    expect(coversSpan(h247, 3, 23 * 60, 120)).toBe(true);
    const h = parseOpeningHours("Mo-Fr 09:00-22:00; Sa,Su 10:00-02:00")!;
    expect(isOpenAt(h, 0, 8 * 60)).toBe(false);
    expect(coversSpan(h, 0, 20 * 60, 120)).toBe(true);
    expect(coversSpan(h, 0, 21 * 60, 120)).toBe(false); // Monday closes at 22:00
    expect(coversSpan(h, 5, 23 * 60, 120)).toBe(true); // Saturday open until 02:00
    expect(isOpenAt(h, 6, 60)).toBe(true); // 1 am Sunday is Saturday's late range
  });
  it("returns null (unknown) for syntax it does not understand", () => {
    expect(parseOpeningHours("Mo-Fr 09:00-18:00; PH off")).toBeNull();
    expect(parseOpeningHours("sunrise-sunset")).toBeNull();
    expect(parseOpeningHours(undefined)).toBeNull();
  });
  it("computes weekday index (Monday = 0)", () => {
    expect(weekdayIndex("2026-11-16")).toBe(0);
    expect(weekdayIndex("2026-11-22")).toBe(6);
  });
});

describe("charges", () => {
  it("parses INR charges and never guesses other currencies", () => {
    expect(parseCharge("20 INR/hour")).toEqual({ amount: 20, currency: "INR", per: "hour" });
    expect(parseCharge("₹30/hr")).toEqual({ amount: 30, currency: "INR", per: "hour" });
    expect(parseCharge("INR 50/day")).toEqual({ amount: 50, currency: "INR", per: "day" });
    expect(parseCharge("40 INR")).toEqual({ amount: 40, currency: "INR", per: "visit" });
    expect(parseCharge("2 EUR/hour")).toBeNull();
    expect(parseCharge("yes")).toBeNull();
  });
  it("prices a stay only when the charge is known", () => {
    expect(chargeFor("no", null, 3)).toBe(0);
    expect(chargeFor("yes", { amount: 20, currency: "INR", per: "hour" }, 2.5)).toBe(60);
    expect(chargeFor("yes", null, 2)).toBeNull();
    expect(chargeFor("unknown", null, 2)).toBeNull();
    expect(chargeLabel("yes", null, null)).toBe("Paid — price unknown");
    expect(chargeLabel("unknown", null, null)).toBe("Fee unknown");
  });
});

describe("OSM parking classification", () => {
  it("FREE / PAID / fee unknown from the fee tag", () => {
    expect((toParking(node(1, { amenity: "parking", fee: "no" })) as { parking: { category: string } }).parking.category).toBe("free");
    expect((toParking(node(2, { amenity: "parking", fee: "yes" })) as { parking: { category: string } }).parking.category).toBe("paid");
    expect((toParking(node(3, { amenity: "parking" })) as { parking: { category: string } }).parking.category).toBe("fee-unknown");
  });
  it("never treats OSM parking as SHARED (no owner-permission source exists)", () => {
    for (const fee of ["yes", "no", undefined]) {
      const r = toParking(node(4, { amenity: "parking", ...(fee ? { fee } : {}) })) as { parking: { category: string } };
      expect(r.parking.category).not.toBe("shared");
    }
  });
  it("excludes private, customers-only and no-access parking", () => {
    for (const access of ["private", "customers", "no", "permit", "residents", "destination"]) {
      expect(toParking(node(5, { amenity: "parking", access, fee: "no" }))).toHaveProperty("excluded");
    }
    expect(toParking(node(6, { amenity: "parking", access: "yes" }))).toHaveProperty("parking");
  });
  it("excludes roadside parking unless public access is explicitly recorded", () => {
    expect(toParking(node(7, { amenity: "parking", parking: "street_side" }))).toHaveProperty("excluded");
    expect(toParking(node(8, { amenity: "parking", parking: "street_side", access: "yes", fee: "yes" }))).toHaveProperty("parking");
  });
  it("uses the capacity tag, or estimates from mapped surface area — never for multi-storey", () => {
    // ~50 m × 40 m = 2000 m² → 80 bays
    const sq = (dLat: number, dLng: number) => [
      { lat: 28.55, lon: 77.19 },
      { lat: 28.55 + dLat, lon: 77.19 },
      { lat: 28.55 + dLat, lon: 77.19 + dLng },
      { lat: 28.55, lon: 77.19 + dLng },
      { lat: 28.55, lon: 77.19 },
    ];
    const g = sq(50 / 111195, 40 / (111195 * Math.cos((28.55 * Math.PI) / 180)));
    expect(Math.round(polygonAreaM2(g)!)).toBeGreaterThan(1950);
    const surface = toParking({ type: "way", id: 9, center: { lat: 28.55, lon: 77.19 }, geometry: g, tags: { amenity: "parking", parking: "surface" } }) as { parking: { capacity: unknown } };
    expect(surface.parking.capacity).toEqual({ value: 80, source: "mapped-area" });
    const tagged = toParking(node(10, { amenity: "parking", capacity: "120" })) as { parking: { capacity: unknown } };
    expect(tagged.parking.capacity).toEqual({ value: 120, source: "osm-tag" });
    const ms = toParking({ type: "way", id: 11, center: { lat: 28.55, lon: 77.19 }, geometry: g, tags: { amenity: "parking", parking: "multi-storey" } }) as { parking: { capacity: unknown } };
    expect(ms.parking.capacity).toBeNull();
  });
  it("keeps facts unknown unless tagged", () => {
    const p = (toParking(node(12, { amenity: "parking", lit: "yes" })) as { parking: { facts: Record<string, unknown> } }).parking;
    expect(p.facts).toEqual({ lit: true, supervised: null, surveillance: null, covered: null });
  });
});

describe("OSM restaurants and normalisation", () => {
  it("keeps named food places only", () => {
    expect(toRestaurant(node(20, { amenity: "restaurant", name: "Test", cuisine: "north_indian;chinese" }))!.cuisine).toBe("north indian, chinese");
    expect(toRestaurant(node(21, { amenity: "restaurant" }))).toBeNull();
    expect(toRestaurant(node(22, { amenity: "bank", name: "X" }))).toBeNull();
  });
  it("merges duplicate elements, sorts by distance and counts activity", () => {
    const center = { lat: 28.55, lng: 77.19 };
    const els: OsmElement[] = [
      node(30, { amenity: "parking", fee: "no" }, 28.56, 77.19),
      node(31, { amenity: "parking", fee: "yes" }, 28.551, 77.19),
      { type: "way", id: 32, center: { lat: 28.552, lon: 77.19 }, tags: { amenity: "parking", access: "private" } },
      node(33, { amenity: "cafe", name: "Near" }, 28.5501, 77.19),
      { type: "count" as never, id: 0, tags: { total: "40" } },
    ];
    const n = normaliseOverpass(els, center);
    expect(n.parkings.map((p) => p.id)).toEqual(["n31", "n30"]);
    expect(n.excluded.map((p) => p.id)).toEqual(["w32"]);
    expect(n.restaurants).toHaveLength(1);
    expect(n.activityCount).toBe(41);
  });
});

describe("opening hours edge cases", () => {
  it("joins ranges across midnight and detects gaps", () => {
    const h = parseOpeningHours("Mo-Su 08:00-24:00")!;
    expect(coversSpan(h, 2, 23 * 60, 120)).toBe(false); // closed 00:00–08:00
    const split = parseOpeningHours("12:00-15:00,19:00-23:00")!;
    expect(coversSpan(split, 1, 13 * 60, 60)).toBe(true);
    expect(coversSpan(split, 1, 14 * 60, 120)).toBe(false); // gap 15:00–19:00
    const late = parseOpeningHours("Fr 18:00-24:00; Sa 00:00-03:00")!;
    expect(coversSpan(late, 4, 23 * 60, 180)).toBe(true);
  });
});
