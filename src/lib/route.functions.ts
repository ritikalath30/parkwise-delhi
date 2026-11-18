import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { AREA_LIST } from "./data";

export type WalkRoute = { distanceM: number; durationMin: number; coords: [number, number][] } | null;

// Only known sample pairs can be routed, so this endpoint is not an open proxy to the
// public OSRM server. Results are cached per instance: the set of pairs is small and fixed.
const cache = new Map<string, WalkRoute>();
const MAX_CACHE = 500;

function lookup(restaurantId: string, parkingId: string) {
  for (const area of AREA_LIST) {
    const r = area.restaurants.find((x) => x.id === restaurantId);
    if (!r) continue;
    const p = area.parkings.find((x) => x.id === parkingId);
    return p ? { r, p } : null;
  }
  return null;
}

/** Real walking route from OpenStreetMap data (FOSSGIS OSRM foot profile). Null when unavailable. */
export const getWalkingRoute = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ restaurantId: z.string().max(40), parkingId: z.string().max(40) }).parse(d),
  )
  .handler(async ({ data }): Promise<WalkRoute> => {
    const pair = lookup(data.restaurantId, data.parkingId);
    if (!pair) return null;
    const key = `${data.parkingId}>${data.restaurantId}`;
    if (cache.has(key)) return cache.get(key)!;
    const { r, p } = pair;
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${p.lng},${p.lat};${r.lng},${r.lat}?overview=full&geometries=geojson`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "ParkWise-GeoAI-prototype" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        console.error("Walking route failed", res.status, await res.text());
        return null;
      }
      const json = (await res.json()) as { code?: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
      const route = json.routes?.[0];
      if (json.code !== "Ok" || !route) return null;
      const result: WalkRoute = {
        distanceM: Math.round(route.distance / 10) * 10,
        durationMin: Math.max(1, Math.round(route.distance / 75)),
        coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      };
      if (cache.size >= MAX_CACHE) cache.clear();
      cache.set(key, result);
      return result;
    } catch (e) {
      console.error("Walking route error", e);
      return null;
    }
  });

/** OSM walking distances for all parking → restaurant pairs in an area (null if unavailable). */
export const getWalkMatrix = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ area: z.string().max(10) }).parse(d))
  .handler(async ({ data }) => {
    const { loadWalkMatrix } = await import("./walk-matrix.server");
    return loadWalkMatrix(data.area);
  });
