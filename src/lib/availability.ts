// Parking availability = the first provider in priority order that can answer for a facility.
//   LIVE            operator feeds, authorised CCTV, IoT sensors        → awaiting integration (no public feed exists)
//   IMAGE ESTIMATE  vehicle detection on licensed high-res imagery     → experimental, awaiting imagery licence + model
//   PREDICTED       demand model; the history behind it is SIMULATED   → operational, labelled simulated
//   UNKNOWN         nothing reliable                                   → shown as "Unknown"
// New sources plug in by adding a provider to PROVIDERS — the engine and UI only see `Availability`.

import type { Parking } from "./places/types";

export type AvailabilityKind = "live" | "image-estimate" | "predicted" | "unknown";
export type OccupancyLevel = "low" | "moderate" | "high" | "very-high";

export type Availability = {
  kind: AvailabilityKind;
  level: OccupancyLevel | null;
  /** Short consumer label, e.g. "Likely spaces". */
  label: string;
  /** Where the number comes from, shown on tap/hover. */
  source: string;
  /** True when the underlying history is synthetic demo data. */
  simulated: boolean;
  asOf: string | null;
};

export type AvailabilityContext = {
  dateISO: string;
  arrivalMin: number;
  hours: number;
  /** Shops + food places within 500 m of the destination (OSM), null if unknown. */
  activityCount: number | null;
};

export type ProviderStatus = "operational" | "experimental" | "awaiting-integration";

export type AvailabilityProvider = {
  id: string;
  kind: Exclude<AvailabilityKind, "unknown">;
  name: string;
  status: ProviderStatus;
  description: string;
  estimate: (p: Parking, ctx: AvailabilityContext) => Availability | null;
};

export const LEVEL_LABEL: Record<OccupancyLevel, string> = {
  low: "Likely spaces",
  moderate: "Moderately busy",
  high: "Busy",
  "very-high": "Likely full",
};

// ── Predicted (simulated history) ────────────────────────────────────────────
// Synthetic hourly occupancy for a typical Indian urban dining/shopping district (0–1).
// Illustrative only — not measured. Stable and reproducible: same inputs, same output.
const SIM_WEEKDAY = [0.12, 0.08, 0.06, 0.05, 0.05, 0.06, 0.1, 0.17, 0.3, 0.43, 0.55, 0.65, 0.73, 0.75, 0.69, 0.64, 0.66, 0.72, 0.77, 0.81, 0.82, 0.75, 0.56, 0.3];
const SIM_WEEKEND = [0.24, 0.15, 0.09, 0.06, 0.05, 0.06, 0.09, 0.15, 0.25, 0.38, 0.53, 0.66, 0.77, 0.83, 0.8, 0.77, 0.8, 0.86, 0.9, 0.93, 0.92, 0.85, 0.68, 0.45];

function isWeekend(dateISO: string) {
  const d = new Date(`${dateISO}T12:00:00Z`).getUTCDay();
  return d === 0 || d === 6;
}

function curveAt(curve: number[], minutes: number) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const t = (m % 60) / 60;
  return curve[h]! + (curve[(h + 1) % 24]! - curve[h]!) * t;
}

/** Simulated occupancy (0–1) blending arrival time (75%) and the rest of the stay (25%). */
export function simulatedOccupancy(p: Parking, ctx: AvailabilityContext): number {
  const curve = isWeekend(ctx.dateISO) ? SIM_WEEKEND : SIM_WEEKDAY;
  const steps = Math.max(1, Math.round(ctx.hours * 2));
  let avg = 0;
  for (let i = 0; i < steps; i++) avg += curveAt(curve, ctx.arrivalMin + (i * 60 * ctx.hours) / steps);
  avg /= steps;
  const base = 0.75 * curveAt(curve, ctx.arrivalMin) + 0.25 * avg;
  // Nearby commercial activity raises demand; free lots fill faster; large structured lots slower.
  const activity = ctx.activityCount === null ? 1 : Math.min(1.15, Math.max(0.75, 0.75 + ctx.activityCount / 500));
  const fee = p.fee === "no" ? 1.12 : 1;
  const kind = p.kind === "multi-storey" || p.kind === "underground" ? 0.88 : 1;
  return Math.min(0.99, Math.max(0.02, base * activity * fee * kind));
}

export function levelOf(occ: number): OccupancyLevel {
  return occ < 0.5 ? "low" : occ < 0.75 ? "moderate" : occ < 0.9 ? "high" : "very-high";
}

export const PROVIDERS: AvailabilityProvider[] = [
  {
    id: "live-operator",
    kind: "live",
    name: "Operator feeds, authorised CCTV & IoT sensors",
    status: "awaiting-integration",
    description: "No public live occupancy feed exists for these facilities. Needs operator or sensor partnerships.",
    estimate: () => null,
  },
  {
    id: "imagery-cv",
    kind: "image-estimate",
    name: "Vehicle detection on aerial / satellite imagery",
    status: "experimental",
    description:
      "Requires licensed imagery at ≤0.5 m/pixel and a vehicle-detection model. Free satellite tiles are too coarse or not licensed for analysis, so no image estimates are produced yet. Never used for covered or underground parking.",
    estimate: () => null,
  },
  {
    id: "simulated-demand",
    kind: "predicted",
    name: "Demand model (simulated history)",
    status: "operational",
    description: "Time of day, weekday/weekend, stay length and nearby commercial activity applied to a SIMULATED historical demand curve.",
    estimate: (p, ctx) => {
      const level = levelOf(simulatedOccupancy(p, ctx));
      return { kind: "predicted", level, label: LEVEL_LABEL[level], source: "Prediction from simulated demand history", simulated: true, asOf: null };
    },
  },
];

export const UNKNOWN: Availability = { kind: "unknown", level: null, label: "Unknown", source: "No reliable availability data", simulated: false, asOf: null };

export function availabilityFor(p: Parking, ctx: AvailabilityContext, providers: AvailabilityProvider[] = PROVIDERS): Availability {
  for (const pr of providers) {
    const a = pr.estimate(p, ctx);
    if (a) return a;
  }
  return UNKNOWN;
}

export const KIND_LABEL: Record<AvailabilityKind, string> = {
  live: "LIVE",
  "image-estimate": "IMAGE ESTIMATE",
  predicted: "PREDICTED",
  unknown: "UNKNOWN",
};
