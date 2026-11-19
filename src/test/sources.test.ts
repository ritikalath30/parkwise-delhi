import { beforeEach, describe, expect, it } from "vitest";
import { geoapifyToOsm } from "@/lib/places/geoapify";
import { __clearCaches, __resetLiveState, loadPlaceData } from "@/lib/places/server";

const down = (async () => new Response("busy", { status: 502 })) as unknown as typeof fetch;

describe("place-data source chain", () => {
  beforeEach(() => {
    __clearCaches();
    __resetLiveState();
  });

  it("falls back to clearly labelled DEMO DATA near a Delhi demo area when live sources fail", async () => {
    const d = await loadPlaceData(28.5539, 77.1942, down);
    expect(d.error).toBeNull();
    expect(d.demo).toBe(true);
    expect(d.sources.places).toMatch(/^DEMO DATA/);
    expect(d.restaurants.length).toBeGreaterThan(0);
    expect(d.parkings.every((p) => p.name?.startsWith("Demo ") && p.url === "")).toBe(true);
    expect(d.parkings.every((p) => p.name?.includes("Hauz Khas Village"))).toBe(true); // no far-away demo areas
    expect(d.parkings.map((p) => p.name)).not.toContain("Demo Private Residents' Lot (Hauz Khas Village)");
  });

  it("returns an explicit error (no invented places) outside demo coverage", async () => {
    const d = await loadPlaceData(19.0583, 72.8302, down); // Mumbai
    expect(d.demo).toBe(false);
    expect(d.restaurants).toHaveLength(0);
    expect(d.error).toMatch(/no demo data for this location/);
  });

  it("uses live OpenStreetMap data when Overpass answers", async () => {
    const ok = (async (u: string | URL) =>
      String(u).includes("interpreter")
        ? Response.json({ elements: [{ type: "node", id: 1, lat: 28.6, lon: 77.2, tags: { amenity: "parking", fee: "no" } }, { type: "node", id: 2, lat: 28.6001, lon: 77.2, tags: { amenity: "cafe", name: "Real Café" } }] })
        : new Response("no", { status: 500 })) as unknown as typeof fetch;
    const d = await loadPlaceData(28.6, 77.2, ok);
    expect(d.demo).toBe(false);
    expect(d.sources.places).toMatch(/^OpenStreetMap via/);
    expect(d.restaurants[0]!.name).toBe("Real Café");
  });
});

describe("Geoapify conversion", () => {
  it("maps raw OSM tags so the same rules (access, fee, charge) apply", () => {
    const els = geoapifyToOsm([
      { properties: { lat: 28.6, lon: 77.2, datasource: { raw: { osm_type: "w", osm_id: 123, amenity: "parking", fee: "yes", charge: "30 INR/hour" } } } },
      { properties: { lat: 28.6, lon: 77.2, datasource: { raw: { osm_type: "n", osm_id: 9, amenity: "parking", access: "private" } } } },
    ]);
    expect(els[0]).toMatchObject({ type: "way", id: 123, tags: { fee: "yes", charge: "30 INR/hour" } });
    expect(els[1]!.tags?.access).toBe("private");
  });
});
