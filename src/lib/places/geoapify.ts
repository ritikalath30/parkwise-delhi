// Optional provider: Geoapify Places (OpenStreetMap-based, keyed). Used only when GEOAPIFY_API_KEY is set.
// Geoapify returns the original OSM tags in properties.datasource.raw, so we reuse the OSM normaliser.
import type { OsmElement, OsmTags } from "./osm";

type GeoFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { lat?: number; lon?: number; name?: string; datasource?: { raw?: Record<string, unknown> } };
};

export function geoapifyToOsm(features: GeoFeature[]): OsmElement[] {
  const out: OsmElement[] = [];
  for (const f of features) {
    const p = f.properties ?? {};
    const raw = (p.datasource?.raw ?? {}) as Record<string, unknown>;
    const lat = p.lat ?? f.geometry?.coordinates?.[1];
    const lon = p.lon ?? f.geometry?.coordinates?.[0];
    const id = Number(raw["osm_id"]);
    if (lat === undefined || lon === undefined || !Number.isFinite(id)) continue;
    const t = raw["osm_type"];
    const tags: OsmTags = {};
    for (const [k, v] of Object.entries(raw)) if (typeof v === "string" || typeof v === "number") (tags as Record<string, string>)[k] = String(v);
    out.push({ type: t === "w" ? "way" : t === "r" ? "relation" : "node", id: Math.abs(id), lat, lon, tags });
  }
  return out;
}

export async function fetchGeoapify(lat: number, lng: number, key: string, f: typeof fetch): Promise<OsmElement[]> {
  const get = async (categories: string, radius: number) => {
    const u = new URL("https://api.geoapify.com/v2/places");
    u.searchParams.set("categories", categories);
    u.searchParams.set("filter", `circle:${lng},${lat},${radius}`);
    u.searchParams.set("bias", `proximity:${lng},${lat}`);
    u.searchParams.set("limit", "100");
    u.searchParams.set("apiKey", key);
    const res = await f(u, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Geoapify HTTP ${res.status}`);
    return ((await res.json()) as { features?: GeoFeature[] }).features ?? [];
  };
  const [food, park] = await Promise.all([get("catering.restaurant,catering.cafe,catering.fast_food,catering.food_court", 700), get("parking.cars", 1500)]);
  return geoapifyToOsm([...food, ...park]);
}
