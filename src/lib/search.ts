import { fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import type { Criteria, Pref } from "./engine";

// Trip criteria travel between Search → Explore → Plan as validated URL params,
// so every screen is shareable and needs no login or storage.
export const criteriaSearchSchema = z.object({
  /** Destination label shown to the user */
  q: fallback(z.string(), "").default(""),
  lat: fallback(z.number().optional(), undefined),
  lng: fallback(z.number().optional(), undefined),
  /** YYYY-MM-DD; empty = today */
  date: fallback(z.string(), "").default(""),
  time: fallback(z.string(), "19:30").default("19:30"),
  hours: fallback(z.number(), 2).default(2),
  budget: fallback(z.number(), 150).default(150),
  walk: fallback(z.number(), 600).default(600),
  pref: fallback(z.string(), "both").default("both"),
  /** Legacy links (?area=hkv) from the first prototype */
  area: fallback(z.string().optional(), undefined),
});

export type CriteriaSearch = z.infer<typeof criteriaSearchSchema>;

export const PREF_OPTIONS = [
  { value: "free", label: "Free only", hint: "Only parking recorded as free (₹0)" },
  { value: "paid", label: "Paid", hint: "Paid parking, including where the price isn't recorded" },
  { value: "both", label: "Both", hint: "Free and paid" },
] as const;

export const BUDGET_RANGE = { min: 20, max: 400, step: 10 };
export const WALK_RANGE = { min: 100, max: 1500, step: 50 };
export const HOURS_OPTIONS = [1, 2, 3, 4, 5, 6];

const LEGACY_AREAS: Record<string, { q: string; lat: number; lng: number }> = {
  hkv: { q: "Hauz Khas Village, New Delhi", lat: 28.5539, lng: 77.1942 },
  khan: { q: "Khan Market, New Delhi", lat: 28.6001, lng: 77.2265 },
  cp: { q: "Connaught Place, New Delhi", lat: 28.6315, lng: 77.2167 },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function todayISO(now = new Date()) {
  // Indian Standard Time — the app's home market; dates are user-editable either way.
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 10);
}

export type CleanSearch = Omit<CriteriaSearch, "area" | "lat" | "lng"> & { lat: number | undefined; lng: number | undefined };

/** Normalised search params: clamped numbers, valid time/date, legacy area resolved. */
export function cleanSearch(s: Partial<CriteriaSearch>): CleanSearch {
  const legacy = s.area && s.lat === undefined ? LEGACY_AREAS[s.area] : undefined;
  const lat = legacy?.lat ?? (Number.isFinite(s.lat) ? s.lat : undefined);
  const lng = legacy?.lng ?? (Number.isFinite(s.lng) ? s.lng : undefined);
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.time ?? "");
  const time = m ? `${String(clamp(Number(m[1]), 0, 23)).padStart(2, "0")}:${String(clamp(Number(m[2]), 0, 59)).padStart(2, "0")}` : "19:30";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(s.date ?? "") && !Number.isNaN(Date.parse(s.date!)) ? s.date! : "";
  return {
    q: (legacy?.q ?? s.q ?? "").slice(0, 160),
    lat: lat === undefined ? undefined : clamp(lat, -90, 90),
    lng: lng === undefined ? undefined : clamp(lng, -180, 180),
    date,
    time,
    hours: clamp(Math.round(Number(s.hours) || 2), 1, 8),
    budget: clamp(Math.round(Number(s.budget) || 150), BUDGET_RANGE.min, BUDGET_RANGE.max),
    walk: clamp(Math.round(Number(s.walk) || 600), WALK_RANGE.min, WALK_RANGE.max),
    pref: (["free", "paid", "both"].includes(s.pref ?? "") ? s.pref : "both") as Pref,
  };
}

export function toCriteria(s: Partial<CriteriaSearch>, today = todayISO()): Criteria {
  const c = cleanSearch(s);
  const [hh, mm] = c.time.split(":").map(Number);
  return { dateISO: c.date || today, arrival: hh! * 60 + mm!, hours: c.hours, budget: c.budget, walk: c.walk, pref: c.pref as Pref };
}

export function hasDestination(s: CleanSearch): s is CleanSearch & { lat: number; lng: number } {
  return s.lat !== undefined && s.lng !== undefined;
}

/** Patch criteria (engine units) back into URL params. */
export function criteriaPatchToSearch(p: Partial<Criteria>): Partial<CriteriaSearch> {
  const out: Partial<CriteriaSearch> = {};
  if (p.pref) out.pref = p.pref;
  if (p.walk !== undefined) out.walk = p.walk;
  if (p.budget !== undefined) out.budget = p.budget;
  if (p.hours !== undefined) out.hours = p.hours;
  if (p.arrival !== undefined) out.time = `${String(Math.floor(p.arrival / 60)).padStart(2, "0")}:${String(p.arrival % 60).padStart(2, "0")}`;
  return out;
}
