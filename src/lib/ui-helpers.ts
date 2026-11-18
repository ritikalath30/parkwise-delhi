export { formatTime, statusLabel, type ParkingStatus } from "./engine";
export { toCriteria as toCriteriaSafe } from "./search";

export const PRICE_LABEL = { 1: "₹", 2: "₹₹", 3: "₹₹₹" } as const;

export function directionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}
