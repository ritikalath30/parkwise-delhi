export type LatLng = { lat: number; lng: number };

export function haversineM(a: LatLng, b: LatLng) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Street-network factor applied to straight-line distance when no walking route is available. */
export const ROUTE_FACTOR = 1.3;
export const WALK_M_PER_MIN = 75;

export function estimatedWalkM(a: LatLng, b: LatLng) {
  return Math.max(30, Math.round((haversineM(a, b) * ROUTE_FACTOR) / 10) * 10);
}
