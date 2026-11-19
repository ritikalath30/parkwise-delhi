// Pure normalisation of OpenStreetMap (Overpass API) elements into ParkWise places.
// Rules: only what OSM records is used; missing data stays null ("Unknown").
import { haversineM } from "../geo";
import { parseCharge } from "./charge";
import { parseOpeningHours } from "./hours";
import type { ExcludedParking, Parking, ParkingKind, Restaurant } from "./types";

export type OsmTags = {
  amenity?: string;
  name?: string;
  "name:en"?: string;
  access?: string;
  fee?: string;
  charge?: string;
  capacity?: string;
  opening_hours?: string;
  parking?: string;
  lit?: string;
  supervised?: string;
  surveillance?: string;
  "surveillance:type"?: string;
  covered?: string;
  operator?: string;
  cuisine?: string;
  "addr:housenumber"?: string;
  "addr:street"?: string;
  "addr:full"?: string;
  website?: string;
  "contact:website"?: string;
  total?: string;
};

export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  bounds?: { minlat: number; minlon: number; maxlat: number; maxlon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: OsmTags;
};

const osmId = (e: OsmElement) => `${e.type[0]}${e.id}`;
const osmUrl = (e: OsmElement) => `https://www.openstreetmap.org/${e.type}/${e.id}`;

function position(e: OsmElement): { lat: number; lng: number } | null {
  if (e.lat !== undefined && e.lon !== undefined) return { lat: e.lat, lng: e.lon };
  if (e.center) return { lat: e.center.lat, lng: e.center.lon };
  if (e.geometry?.length) {
    const g = e.geometry;
    return { lat: g.reduce((t, p) => t + p.lat, 0) / g.length, lng: g.reduce((t, p) => t + p.lon, 0) / g.length };
  }
  if (e.bounds) return { lat: (e.bounds.minlat + e.bounds.maxlat) / 2, lng: (e.bounds.minlon + e.bounds.maxlon) / 2 };
  return null;
}

/** Polygon area in m² (shoelace on a local equirectangular projection). Null for open/missing geometry. */
export function polygonAreaM2(g: { lat: number; lon: number }[] | undefined): number | null {
  if (!g || g.length < 4) return null;
  const first = g[0]!;
  const last = g[g.length - 1]!;
  if (first.lat !== last.lat || first.lon !== last.lon) return null;
  const lat0 = (first.lat * Math.PI) / 180;
  const R = 6371000;
  const xy = g.map((p) => [((p.lon * Math.PI) / 180) * R * Math.cos(lat0), ((p.lat * Math.PI) / 180) * R] as const);
  let a = 0;
  for (let i = 0; i < xy.length - 1; i++) a += xy[i]![0] * xy[i + 1]![1] - xy[i + 1]![0] * xy[i]![1];
  return Math.abs(a) / 2;
}

/** Typical gross area per car bay including aisles (m²), used only for mapped surface lots. */
export const M2_PER_BAY = 25;

const yesNo = (v: string | undefined): boolean | null => (v === "yes" ? true : v === "no" ? false : null);

const PUBLIC_ACCESS = new Set(["yes", "public", "permissive"]);
const NOT_PUBLIC: Record<string, string> = {
  private: "Private parking",
  no: "No public access",
  customers: "Customers only",
  permit: "Permit holders only",
  residents: "Residents only",
  destination: "Visitors of a specific destination only",
  delivery: "Deliveries only",
  employees: "Employees only",
  staff: "Staff only",
  disabled: "Disabled permit holders only",
};

function kindOf(t: OsmTags): ParkingKind {
  switch (t.parking) {
    case "surface":
      return "surface";
    case "multi-storey":
      return "multi-storey";
    case "underground":
      return "underground";
    case "rooftop":
      return "rooftop";
    case "street_side":
    case "lane":
    case "on_kerb":
    case "half_on_kerb":
      return "street-side";
    default:
      return "unknown";
  }
}

export function toParking(e: OsmElement): { parking: Parking } | { excluded: ExcludedParking } | null {
  const t = e.tags ?? {};
  if (t.amenity !== "parking") return null;
  const pos = position(e);
  if (!pos) return null;
  const name = t.name ?? t["name:en"] ?? null;
  const access = t.access ?? null;
  const base = { id: osmId(e), name, lat: pos.lat, lng: pos.lng, url: osmUrl(e) };
  const kind = kindOf(t);

  if (access && !PUBLIC_ACCESS.has(access)) return { excluded: { ...base, reason: NOT_PUBLIC[access] ?? `Access: ${access}` } };
  // Kerbside parking is only accepted when the map explicitly marks it as public — never inferred from empty road space.
  if (kind === "street-side" && !(access && PUBLIC_ACCESS.has(access))) return { excluded: { ...base, reason: "Roadside space without recorded public access" } };

  const fee = t.fee === "yes" ? "yes" : t.fee === "no" ? "no" : "unknown";
  const chargeRaw = t.charge ?? null;
  const areaM2 = e.type === "way" ? polygonAreaM2(e.geometry) : null;
  const capTag = Number(t.capacity);
  const capacity =
    Number.isFinite(capTag) && capTag > 0
      ? { value: Math.round(capTag), source: "osm-tag" as const }
      : areaM2 && areaM2 >= 200 && (kind === "surface" || kind === "unknown")
        ? { value: Math.max(5, Math.round(areaM2 / M2_PER_BAY / 5) * 5), source: "mapped-area" as const }
        : null;

  return {
    parking: {
      ...base,
      category: fee === "no" ? "free" : fee === "yes" ? "paid" : "fee-unknown",
      kind,
      accessTag: access,
      fee,
      charge: parseCharge(chargeRaw),
      chargeRaw,
      capacity,
      areaM2: areaM2 ? Math.round(areaM2) : null,
      openingHours: t.opening_hours ?? null,
      hours: parseOpeningHours(t.opening_hours),
      facts: {
        lit: yesNo(t.lit),
        supervised: yesNo(t.supervised),
        surveillance: yesNo(t.surveillance) ?? (t["surveillance:type"] ? true : null),
        covered: t.covered === "yes" || kind === "multi-storey" || kind === "underground" ? true : t.covered === "no" ? false : null,
      },
      operator: t.operator ?? null,
      source: "osm",
    },
  };
}

const FOOD = new Set(["restaurant", "cafe", "fast_food", "food_court"]);

export function toRestaurant(e: OsmElement): Restaurant | null {
  const t = e.tags ?? {};
  if (!FOOD.has(t.amenity ?? "")) return null;
  const name = t.name ?? t["name:en"];
  if (!name) return null; // unnamed places are not useful as a destination
  const pos = position(e);
  if (!pos) return null;
  const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
  const cuisine = t.cuisine ? t.cuisine.split(";").map((c) => c.trim().replace(/_/g, " ")).join(", ") : null;
  return {
    id: osmId(e),
    name,
    cuisine: cuisine ?? (t.amenity === "cafe" ? "café" : t.amenity === "fast_food" ? "fast food" : null),
    lat: pos.lat,
    lng: pos.lng,
    openingHours: t.opening_hours ?? null,
    hours: parseOpeningHours(t.opening_hours),
    address: street || t["addr:full"] || null,
    website: t.website ?? t["contact:website"] ?? null,
    source: "osm",
  };
}

export const LIMITS = { restaurants: 40, parkings: 40, foodRadiusM: 800, parkingRadiusM: 1800 };

/** Split Overpass output into restaurants / recommendable parking / excluded parking, nearest first. */
export function normaliseOverpass(elements: OsmElement[], center: { lat: number; lng: number }) {
  const restaurants: Restaurant[] = [];
  const parkings: Parking[] = [];
  const excluded: ExcludedParking[] = [];
  let activityCount: number | null = null;
  const seen = new Set<string>();
  for (const e of elements) {
    if ((e as { type: string }).type === "count") {
      const total = Number(e.tags?.total);
      if (Number.isFinite(total)) activityCount = (activityCount ?? 0) + total;
      continue;
    }
    const id = osmId(e);
    if (seen.has(id)) continue;
    seen.add(id);
    const r = toRestaurant(e);
    if (r) {
      restaurants.push(r);
      continue;
    }
    const p = toParking(e);
    if (p && "parking" in p) parkings.push(p.parking);
    else if (p) excluded.push(p.excluded);
  }
  const byDist = <T extends { lat: number; lng: number }>(a: T, b: T) => haversineM(center, a) - haversineM(center, b);
  restaurants.sort(byDist);
  parkings.sort(byDist);
  excluded.sort(byDist);
  return {
    restaurants: restaurants.slice(0, LIMITS.restaurants),
    parkings: parkings.slice(0, LIMITS.parkings),
    excluded: excluded.slice(0, 60),
    activityCount: activityCount === null ? null : activityCount + restaurants.filter((r) => haversineM(center, r) <= 500).length,
  };
}
