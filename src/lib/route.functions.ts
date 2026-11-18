import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const pt = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export type WalkRoute = { distanceM: number; durationMin: number; coords: [number, number][] } | null;

/** Real walking route from OpenStreetMap data (FOSSGIS OSRM foot profile). Null when unavailable. */
export const getWalkingRoute = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ from: pt, to: pt }).parse(d))
  .handler(async ({ data }): Promise<WalkRoute> => {
    const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${data.from.lng},${data.from.lat};${data.to.lng},${data.to.lat}?overview=full&geometries=geojson`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "ParkWise-GeoAI-prototype" }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        console.error("Walking route failed", res.status, await res.text());
        return null;
      }
      const json = (await res.json()) as { code?: string; routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
      const r = json.routes?.[0];
      if (json.code !== "Ok" || !r) return null;
      return {
        distanceM: Math.round(r.distance / 10) * 10,
        durationMin: Math.max(1, Math.round(r.distance / 75)),
        coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]),
      };
    } catch (e) {
      console.error("Walking route error", e);
      return null;
    }
  });
