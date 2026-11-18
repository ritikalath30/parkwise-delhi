// Server-only: OSM walking distances for every authorised-parking → restaurant pair in an area,
// fetched with ONE request to the public FOSSGIS OSRM "table" service and cached per instance.
import { getArea } from "./data";
import { isRecommendable, routeKey, type RouteMatrix } from "./engine";

const cache = new Map<string, { at: number; matrix: RouteMatrix | null }>();
const TTL_MS = 6 * 60 * 60 * 1000; // routes rarely change; retry failures after 5 min
const FAIL_TTL_MS = 5 * 60 * 1000;

export async function loadWalkMatrix(areaId: string, fetchImpl: typeof fetch = fetch): Promise<RouteMatrix | null> {
  const area = getArea(areaId);
  const hit = cache.get(area.id);
  if (hit && Date.now() - hit.at < (hit.matrix ? TTL_MS : FAIL_TTL_MS)) return hit.matrix;

  const parkings = area.parkings.filter(isRecommendable);
  const pts = [...parkings, ...area.restaurants].map((p) => `${p.lng},${p.lat}`).join(";");
  const sources = parkings.map((_, i) => i).join(";");
  const destinations = area.restaurants.map((_, i) => parkings.length + i).join(";");
  const url = `https://routing.openstreetmap.de/routed-foot/table/v1/foot/${pts}?sources=${sources}&destinations=${destinations}&annotations=distance`;
  let matrix: RouteMatrix | null = null;
  try {
    const res = await fetchImpl(url, { headers: { "User-Agent": "ParkWise-GeoAI-prototype" }, signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const json = (await res.json()) as { code?: string; distances?: (number | null)[][] };
      if (json.code === "Ok" && json.distances) {
        matrix = {};
        parkings.forEach((p, i) =>
          area.restaurants.forEach((r, j) => {
            const d = json.distances![i]?.[j];
            if (typeof d === "number" && Number.isFinite(d)) matrix![routeKey(p.id, r.id)] = Math.round(d);
          }),
        );
        if (Object.keys(matrix).length === 0) matrix = null;
      }
    } else console.error("Walk matrix failed", res.status);
  } catch (e) {
    console.error("Walk matrix error", e);
  }
  cache.set(area.id, { at: Date.now(), matrix });
  return matrix;
}

export function clearWalkMatrixCache() {
  cache.clear();
}
