export { formatTime, statusLabel, type ParkingStatus } from "./engine";
export { toCriteria as toCriteriaSafe } from "./search";

export const PRICE_LABEL = { 1: "₹", 2: "₹₹", 3: "₹₹₹" } as const;

export function directionsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
}

export function walkingUrl(from: { lat: number; lng: number }, to: { lat: number; lng: number }) {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=walking`;
}

export function chargesText(p: { firstHour: number; perHourAfter: number; dailyMax?: number | undefined }) {
  if (p.perHourAfter === 0) return `₹${p.firstHour} flat per visit`;
  return `₹${p.firstHour} first hour, then ₹${p.perHourAfter}/hr${p.dailyMax ? ` (max ₹${p.dailyMax})` : ""}`;
}

export function hoursText(p: { openFrom: number; openTo: number }) {
  const f = (h: number) => (h >= 24 ? "midnight" : `${h % 12 === 0 ? 12 : h % 12} ${h >= 12 ? "pm" : "am"}`);
  return `${f(p.openFrom)} – ${f(p.openTo)}`;
}
