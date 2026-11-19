// Server-only data access: OpenStreetMap via Overpass, Photon geocoding, OSRM walking matrix.
// All three are free public services with fair-use policies, so results are cached per instance
// and responses carry CDN cache headers in the API routes.
import { normaliseOverpass, LIMITS, type OsmElement } from "./osm";
import type { GeocodeResult, PlaceData } from "./types";

const UA = "ParkWise-GeoAI/1.0 (prototype; https://parkwise-delhi.vercel.app)";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const OSRM_TABLE = "https://routing.openstreetmap.de/routed-foot/table/v1/foot/";
const PHOTON = "https://photon.komoot.io/api/";

type CacheEntry<T> = { at: number; value: T };
function memo<T>(ttlMs: number, max = 300) {
  const m = new Map<string, CacheEntry<T>>();
  return {
    get(k: string) {
      const e = m.get(k);
      return e && Date.now() - e.at < ttlMs ? e.value : undefined;
    },
    set(k: string, v: T) {
      if (m.size >= max) m.delete(m.keys().next().value!);
      m.set(k, { at: Date.now(), value: v });
    },
    clear: () => m.clear(),
  };
}
const placeCache = memo<PlaceData>(60 * 60 * 1000);
const geoCache = memo<GeocodeResult[]>(24 * 60 * 60 * 1000, 1000);
export const __clearCaches = () => {
  placeCache.clear();
  geoCache.clear();
};

export function overpassQuery(lat: number, lng: number) {
  return `[out:json][timeout:25];
nwr["amenity"~"^(restaurant|cafe|fast_food|food_court)$"](around:${LIMITS.foodRadiusM},${lat},${lng})->.food;
nwr["amenity"="parking"](around:${LIMITS.parkingRadiusM},${lat},${lng})->.park;
nwr["shop"](around:500,${lat},${lng})->.shop;
.food out tags center;
.park out tags geom;
.shop out count;`;
}

async function fetchOverpass(query: string, f: typeof fetch): Promise<{ elements: OsmElement[]; endpoint: string }> {
  let lastErr: unknown = null;
  for (const endpoint of OVERPASS) {
    try {
      const res = await f(endpoint, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { elements?: OsmElement[] };
      return { elements: json.elements ?? [], endpoint };
    } catch (e) {
      lastErr = e;
      console.error("Overpass failed", endpoint, e instanceof Error ? e.message : e);
    }
  }
  throw lastErr ?? new Error("Overpass unavailable");
}

/** OSM walking distances for every parking → restaurant pair (one OSRM table request). */
export async function fetchWalkMatrix(
  parkings: { id: string; lat: number; lng: number }[],
  restaurants: { id: string; lat: number; lng: number }[],
  f: typeof fetch = fetch,
): Promise<Record<string, number> | null> {
  if (!parkings.length || !restaurants.length) return null;
  const pts = [...parkings, ...restaurants].map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(";");
  const sources = parkings.map((_, i) => i).join(";");
  const destinations = restaurants.map((_, i) => parkings.length + i).join(";");
  try {
    const res = await f(`${OSRM_TABLE}${pts}?sources=${sources}&destinations=${destinations}&annotations=distance`, {
      headers: { "User-Agent": UA },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { code?: string; distances?: (number | null)[][] };
    if (json.code !== "Ok" || !json.distances) return null;
    const out: Record<string, number> = {};
    parkings.forEach((p, i) =>
      restaurants.forEach((r, j) => {
        const d = json.distances![i]?.[j];
        if (typeof d === "number" && Number.isFinite(d)) out[`${p.id}>${r.id}`] = Math.round(d);
      }),
    );
    return Object.keys(out).length ? out : null;
  } catch (e) {
    console.error("Walk matrix failed", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function loadPlaceData(lat: number, lng: number, f: typeof fetch = fetch): Promise<PlaceData> {
  // ~100 m grid so nearby searches share a cache entry
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = placeCache.get(key);
  if (hit) return hit;
  const center = { lat, lng };
  const empty = (error: string): PlaceData => ({
    center,
    restaurants: [],
    parkings: [],
    excluded: [],
    activityCount: null,
    routes: null,
    fetchedAt: new Date().toISOString(),
    sources: { places: "OpenStreetMap (Overpass API)", routes: null },
    error,
  });
  let elements: OsmElement[];
  let endpoint: string;
  try {
    ({ elements, endpoint } = await fetchOverpass(overpassQuery(lat, lng), f));
  } catch {
    return empty("Map data service (OpenStreetMap Overpass) is not responding. Please try again in a minute.");
  }
  const n = normaliseOverpass(elements, center);
  const routes = await fetchWalkMatrix(n.parkings, n.restaurants, f);
  const data: PlaceData = {
    center,
    ...n,
    routes,
    fetchedAt: new Date().toISOString(),
    sources: { places: `OpenStreetMap via ${new URL(endpoint).host}`, routes: routes ? "OpenStreetMap walking routes (FOSSGIS OSRM)" : null },
    error: null,
  };
  placeCache.set(key, data);
  return data;
}

type PhotonFeature = { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> };

export async function geocode(q: string, bias: { lat: number; lng: number } | null, f: typeof fetch = fetch): Promise<GeocodeResult[]> {
  const query = q.trim().slice(0, 120);
  if (query.length < 2) return [];
  const key = `${query.toLowerCase()}|${bias ? `${bias.lat.toFixed(1)},${bias.lng.toFixed(1)}` : ""}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const url = new URL(PHOTON);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "7");
  url.searchParams.set("lang", "en");
  if (bias) {
    url.searchParams.set("lat", String(bias.lat));
    url.searchParams.set("lon", String(bias.lng));
  }
  const res = await f(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) throw new Error(`Geocoding HTTP ${res.status}`);
  const json = (await res.json()) as { features?: PhotonFeature[] };
  const seen = new Set<string>();
  const out: GeocodeResult[] = [];
  for (const ft of json.features ?? []) {
    const p = ft.properties;
    const [lng, lat] = ft.geometry.coordinates;
    const name = p.name ?? [p.housenumber, p.street].filter(Boolean).join(" ");
    if (!name) continue;
    const detail = [p.street && p.name ? p.street : null, p.district ?? p.locality, p.city ?? p.county, p.state, p.country]
      .filter((x, i, a) => x && a.indexOf(x) === i && x !== name)
      .join(", ");
    const label = name;
    const dedupe = `${label}|${detail}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push({ id: `${p.osm_type ?? ""}${p.osm_id ?? out.length}`, label, detail, lat, lng, kind: (p.osm_value ?? p.type ?? "place").replace(/_/g, " ") });
  }
  geoCache.set(key, out);
  return out;
}
