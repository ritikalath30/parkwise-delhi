// Server-only data access: OpenStreetMap via Overpass, Photon geocoding, OSRM walking matrix.
// All three are free public services with fair-use policies, so results are cached per instance
// and responses carry CDN cache headers in the API routes.
import { haversineM } from "../geo";
import delhi from "./delhi-osm.json";
import { normaliseOverpass, LIMITS, type OsmElement } from "./osm";
import type { GeocodeResult, PlaceData } from "./types";

const UA = "ParkWise-GeoAI/1.0 (+https://github.com/ritikalath30/parkwise-delhi)";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
] as const;
const OSRM_TABLE = "https://routing.openstreetmap.de/routed-foot/table/v1/foot/";
const PHOTON = "https://photon.komoot.io/api/";
/** minLon,minLat,maxLon,maxLat */
const SEARCH_BBOX = "76.98,28.43,77.50,28.74"; // area covered by the bundled Delhi snapshot

type CacheEntry<T> = { at: number; value: T };
function memo<T>(ttlMs: number, max = 300) {
  const m = new Map<string, CacheEntry<T>>();
  return {
    get(k: string) {
      const e = m.get(k);
      return e && Date.now() - e.at < ttlMs ? e.value : undefined;
    },
    set(k: string, v: T, customTtl?: number) {
      if (m.size >= max) m.delete(m.keys().next().value!);
      m.set(k, { at: Date.now() - (customTtl ? ttlMs - customTtl : 0), value: v });
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
  // Kept deliberately light for the shared public servers: centres only, and full outlines only
  // for lots that need an area-based capacity estimate.
  const at = `${lat},${lng}`;
  return `[out:json][timeout:25];
nwr["amenity"~"^(restaurant|cafe|fast_food|food_court)$"]["name"](around:${LIMITS.foodRadiusM},${at})->.food;
nwr["amenity"="parking"](around:${LIMITS.parkingRadiusM},${at})->.park;
.food out tags center qt 150;
.park out tags center qt;
way.park[!"capacity"]["parking"!~"multi-storey|underground|rooftop"];
out ids geom qt;
nwr["shop"](around:500,${at});
out count;`;
}

async function fetchOverpass(query: string, f: typeof fetch): Promise<{ elements: OsmElement[]; endpoint: string }> {
  // Public Overpass servers are often saturated: ask two at once and take the first good answer,
  // then fall back to the remaining mirrors one by one.
  const attempt = async (endpoint: string, timeoutMs: number) => {
    const res = await f(endpoint, {
      method: "POST",
      headers: { "User-Agent": UA, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: new URLSearchParams({ data: query }).toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`${endpoint} HTTP ${res.status} ${(await res.text()).slice(0, 120).replace(/\s+/g, " ")}`);
    const json = (await res.json()) as { elements?: OsmElement[]; remark?: string };
    if (!json.elements || (json.remark && /runtime error|timed out/i.test(json.remark))) throw new Error(`${endpoint} ${json.remark ?? "no elements"}`);
    return { elements: json.elements, endpoint };
  };
  try {
    return await Promise.any([attempt(OVERPASS[0]!, 9000), attempt(OVERPASS[3]!, 9000)]);
  } catch (e) {
    for (const err of (e as AggregateError).errors ?? [e]) console.error("Overpass failed", err instanceof Error ? err.message : err);
  }
  throw new Error("Overpass unavailable");
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

function testFixturePath() {
  const p = typeof process !== "undefined" ? process.env["PARKWISE_TEST_FIXTURE"] : undefined;
  return p && process.env["NODE_ENV"] !== "production" && !process.env["VERCEL"] ? p : null;
}

/** Remember a failed live source briefly so every search doesn't wait for the same timeout. */
let liveDownUntil = 0;

export async function loadPlaceData(lat: number, lng: number, f: typeof fetch = fetch): Promise<PlaceData> {
  // ~100 m grid so nearby searches share a cache entry
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`;
  const hit = placeCache.get(key);
  if (hit) return hit;
  const center = { lat, lng };
  const env = typeof process !== "undefined" ? process.env : {};

  // Source chain: test fixture (dev only) → bundled Delhi OSM snapshot → Geoapify (if keyed) → live Overpass.
  let elements: OsmElement[] | null = null;
  let source = "";
  let activity: number | null = null;
  const fixture = testFixturePath();
  if (fixture) {
    const { readFile } = await import("node:fs/promises");
    elements = (JSON.parse(await readFile(fixture, "utf8")) as { elements: OsmElement[] }).elements;
    source = "TEST FIXTURE (synthetic, automated tests only)";
  }
  if (!elements && inDelhi(lat, lng)) {
    ({ elements, activity } = delhiNear(lat, lng));
    source = `OpenStreetMap snapshot of Delhi (${delhi.snapshot})`;
  }
  const geoKey = env["GEOAPIFY_API_KEY"];
  if (!elements && geoKey) {
    try {
      elements = await (await import("./geoapify")).fetchGeoapify(lat, lng, geoKey, f);
      source = "OpenStreetMap via Geoapify";
    } catch (e) {
      console.error("Geoapify failed", e instanceof Error ? e.message : e);
    }
  }
  if (!elements && Date.now() > liveDownUntil) {
    try {
      const r = await fetchOverpass(overpassQuery(lat, lng), f);
      elements = r.elements;
      source = `OpenStreetMap via ${new URL(r.endpoint).host}`;
    } catch {
      liveDownUntil = Date.now() + 2 * 60 * 1000;
    }
  }
  if (!elements)
    return {
      center,
      restaurants: [],
      parkings: [],
      excluded: [],
      activityCount: null,
      routes: null,
      fetchedAt: new Date().toISOString(),
      sources: { places: "OpenStreetMap", routes: null },
      demo: false,
      error: "This prototype currently covers Delhi. Live map data for other places is unavailable right now.",
    };

  const n = normaliseOverpass(elements, center);
  if (activity !== null) n.activityCount = activity;
  const routes = await fetchWalkMatrix(n.parkings, n.restaurants, f);
  const data: PlaceData = {
    center,
    ...n,
    routes,
    fetchedAt: new Date().toISOString(),
    sources: { places: source, routes: routes ? "OpenStreetMap walking routes (FOSSGIS OSRM)" : null },
    demo: false,
    error: null,
  };
  placeCache.set(key, data);
  return data;
}

const B = { minLat: 28.43, maxLat: 28.74, minLng: 76.98, maxLng: 77.5 };
function inDelhi(lat: number, lng: number) {
  return lat >= B.minLat && lat <= B.maxLat && lng >= B.minLng && lng <= B.maxLng;
}

/** Elements of the bundled Delhi snapshot within the usual search radii, plus a commercial-activity count. */
function delhiNear(lat: number, lng: number): { elements: OsmElement[]; activity: number } {
  const c = { lat, lng };
  // cheap bounding pre-filter (~0.02° ≈ 2 km) before exact distances
  const elements = (delhi.elements as OsmElement[]).filter((e) => {
    const la = e.lat ?? e.center!.lat;
    const lo = e.lon ?? e.center!.lon;
    if (Math.abs(la - lat) > 0.02 || Math.abs(lo - lng) > 0.02) return false;
    const d = haversineM(c, { lat: la, lng: lo });
    return e.tags?.amenity === "parking" ? d <= LIMITS.parkingRadiusM : d <= LIMITS.foodRadiusM;
  });
  let shops = 0;
  for (const [la, lo] of delhi.shops as [number, number][]) if (Math.abs(la - lat) < 0.006 && Math.abs(lo - lng) < 0.006 && haversineM(c, { lat: la, lng: lo }) <= 500) shops++;
  return { elements, activity: shops };
}

export const __resetLiveState = () => {
  liveDownUntil = 0;
};

type PhotonProps = Partial<Record<"name" | "housenumber" | "street" | "district" | "locality" | "city" | "county" | "state" | "country" | "osm_type" | "osm_id" | "osm_value" | "type", string>>;
type PhotonFeature = { geometry: { coordinates: [number, number] }; properties: PhotonProps };

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
  // Delhi-first prototype: only suggest places covered by the bundled Delhi data. Widen per city launch.
  url.searchParams.set("bbox", SEARCH_BBOX);
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
