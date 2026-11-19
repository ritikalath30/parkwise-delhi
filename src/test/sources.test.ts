import { beforeEach, describe, expect, it } from "vitest";
import { geoapifyToOsm } from "@/lib/places/geoapify";
import { __clearCaches, __resetLiveState, loadPlaceData } from "@/lib/places/server";

const down = (async () => new Response("busy", { status: 502 })) as unknown as typeof fetch;

describe("place-data source chain", () => {
  beforeEach(() => {
    __clearCaches();
    __resetLiveState();
  });

  it("serves real OpenStreetMap data for Delhi from the bundled snapshot, without any network call", async () => {
    const d = await loadPlaceData(28.5539, 77.1942, down);
    expect(d.error).toBeNull();
    expect(d.demo).toBe(false);
    expect(d.sources.places).toMatch(/^OpenStreetMap snapshot of Delhi/);
    expect(d.restaurants.length).toBeGreaterThan(5);
    expect(d.parkings.length).toBeGreaterThan(0);
    expect(d.parkings.every((p) => p.url.startsWith("https://www.openstreetmap.org/"))).toBe(true);
    expect(d.activityCount).toBeGreaterThan(0);
  });

  it("covers other Delhi areas too (Khan Market, Connaught Place, Lajpat Nagar)", async () => {
    for (const [lat, lng] of [[28.6001, 77.2265], [28.6315, 77.2167], [28.5677, 77.2433]] as const) {
      const d = await loadPlaceData(lat, lng, down);
      expect(d.restaurants.length).toBeGreaterThan(5);
    }
  });

  it("returns an explicit error (no invented places) outside Delhi when live sources fail", async () => {
    const d = await loadPlaceData(19.0583, 72.8302, down); // Mumbai
    expect(d.restaurants).toHaveLength(0);
    expect(d.error).toMatch(/covers Delhi/);
  });

  it("uses live OpenStreetMap data when Overpass answers", async () => {
    const ok = (async (u: string | URL) =>
      String(u).includes("interpreter")
        ? Response.json({ elements: [{ type: "node", id: 1, lat: 19.06, lon: 72.83, tags: { amenity: "parking", fee: "no" } }, { type: "node", id: 2, lat: 19.0601, lon: 72.83, tags: { amenity: "cafe", name: "Real Café" } }] })
        : new Response("no", { status: 500 })) as unknown as typeof fetch;
    const d = await loadPlaceData(19.06, 72.83, ok); // outside Delhi → live source
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
