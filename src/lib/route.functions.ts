import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type WalkRoute = { distanceM: number; durationMin: number; coords: [number, number][] } | null;

const UA = "ParkWise-GeoAI/1.0 (+https://github.com/ritikalath30/parkwise-delhi)";
const cache = new Map<string, WalkRoute>();

/**
 * Walking route (OpenStreetMap, FOSSGIS OSRM foot profile) between a parking facility and a restaurant
 * that both belong to the destination's place data — so this is not an open routing proxy.
 */
export const getWalkingRoute = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), parkingId: z.string().max(40), restaurantId: z.string().max(40) }).parse(d),
  )
  .handler(async ({ data }): Promise<WalkRoute> => {
    const key = `${data.parkingId}>${data.restaurantId}`;
    if (cache.has(key)) return cache.get(key)!;
    const { loadPlaceData } = await import("./places/server");
    const places = await loadPlaceData(data.lat, data.lng);
    const p = places.parkings.find((x) => x.id === data.parkingId);
    const r = places.restaurants.find((x) => x.id === data.restaurantId);
    if (!p || !r) return null;
    try {
      const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${p.lng},${p.lat};${r.lng},${r.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const json = (await res.json()) as { code?: string; routes?: { distance: number; geometry: { coordinates: [number, number][] } }[] };
      const route = json.routes?.[0];
      if (json.code !== "Ok" || !route) return null;
      const result: WalkRoute = {
        distanceM: Math.round(route.distance / 10) * 10,
        durationMin: Math.max(1, Math.round(route.distance / 75)),
        coords: route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      };
      if (cache.size > 2000) cache.clear();
      cache.set(key, result);
      return result;
    } catch (e) {
      console.error("Walking route error", e instanceof Error ? e.message : e);
      return null;
    }
  });
