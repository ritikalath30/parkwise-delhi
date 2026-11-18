// Parking Safety Score for the ParkWise prototype.
// Inputs are SYNTHETIC indicators from src/lib/data.ts — they are illustrative, not audited,
// and the score is never a claim that a facility is safe. Authorisation is a hard eligibility
// rule in the engine; it only adds a small weight here and can never be outweighed.

import type { Parking } from "./data";

export type SafetyBand = "high" | "moderate" | "limited";

export type SafetyEval = {
  score: number;
  band: SafetyBand;
  /** Short attribute labels, positive first. */
  attributes: { label: string; ok: boolean }[];
};

/** Points per indicator (sum = 100). */
export const SAFETY_POINTS = {
  cctv: 25,
  guard: 20,
  lighting: { good: 20, partial: 10, poor: 0 },
  footfall: { high: 15, medium: 8, low: 0 },
  /** Controlled entry: multi-level / underground facilities have a single staffed access point. */
  controlledEntry: 10,
  authorisation: { authorised: 10, "shared-permission": 6 },
} as const;

export function safetyBand(score: number): SafetyBand {
  return score >= 70 ? "high" : score >= 45 ? "moderate" : "limited";
}

export const SAFETY_BAND_LABEL: Record<SafetyBand, string> = {
  high: "High safety indicators",
  moderate: "Moderate safety indicators",
  limited: "Limited safety indicators",
};

export function evaluateSafety(p: Parking): SafetyEval {
  const s = p.safety;
  const controlled = p.kind !== "Surface";
  const auth = p.authorisation === "authorised" ? SAFETY_POINTS.authorisation.authorised : p.authorisation === "shared-permission" ? SAFETY_POINTS.authorisation["shared-permission"] : 0;
  const score =
    (s.cctv ? SAFETY_POINTS.cctv : 0) +
    (s.guard ? SAFETY_POINTS.guard : 0) +
    SAFETY_POINTS.lighting[s.lighting] +
    SAFETY_POINTS.footfall[s.footfall] +
    (controlled ? SAFETY_POINTS.controlledEntry : 0) +
    auth;
  const attributes = [
    { label: "CCTV", ok: s.cctv },
    { label: "Guard", ok: s.guard },
    { label: s.lighting === "good" ? "Well lit" : s.lighting === "partial" ? "Partly lit" : "Poorly lit", ok: s.lighting === "good" },
    { label: `${s.footfall[0]!.toUpperCase()}${s.footfall.slice(1)} footfall`, ok: s.footfall === "high" },
    { label: controlled ? "Controlled entry" : "Open lot", ok: controlled },
  ].sort((a, b) => Number(b.ok) - Number(a.ok));
  return { score, band: safetyBand(score), attributes };
}

export type WalkSafetyNote = { level: "lower" | "some" | "higher"; text: string };

/**
 * Walking-route context — kept separate from the facility score because no reliable
 * street-level safety data is available. Based only on route length and darkness during the stay.
 */
export function walkingRouteNote(walkM: number, arrivalMin: number, hours: number): WalkSafetyNote {
  const start = arrivalMin / 60;
  const end = start + hours;
  const dark = start >= 19 || end > 19 || start < 6;
  if (!dark) return { level: "lower", text: `Daylight walk of ~${walkM} m` };
  if (walkM <= 250) return { level: "lower", text: `Short walk (~${walkM} m) after dark` };
  if (walkM <= 500) return { level: "some", text: `~${walkM} m walk after dark — prefer main lanes` };
  return { level: "higher", text: `Long walk (~${walkM} m) after dark — prefer main lanes or a closer facility` };
}
