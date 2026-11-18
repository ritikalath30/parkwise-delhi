import { fallback } from "@tanstack/zod-adapter";
import { z } from "zod";
import { AREAS, type AreaId } from "./data";
import { formatTime, topRecommendations, type Criteria, type DayType, type ParkingPref } from "./engine";

export const criteriaSearchSchema = z.object({
  area: fallback(z.string(), "hkv").default("hkv"),
  time: fallback(z.string(), "19:30").default("19:30"),
  day: fallback(z.string(), "weekend").default("weekend"),
  hours: fallback(z.number(), 2).default(2),
  budget: fallback(z.number(), 150).default(150),
  walk: fallback(z.number(), 600).default(600),
  pref: fallback(z.string(), "both").default("both"),
});

export type CriteriaSearch = z.infer<typeof criteriaSearchSchema>;

export const DEFAULT_SEARCH: CriteriaSearch = {
  area: "hkv",
  time: "19:30",
  day: "weekend",
  hours: 2,
  budget: 150,
  walk: 600,
  pref: "both",
};

export const PREF_OPTIONS = [
  { value: "free", label: "Free only (₹0)", short: "Free only" },
  { value: "both", label: "Free + paid", short: "Free + paid" },
  { value: "paid", label: "Paid is fine", short: "Paid OK" },
] as const;

export const BUDGET_RANGE = { min: 20, max: 400, step: 10 };
export const WALK_RANGE = { min: 100, max: 1500, step: 50 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export type CriteriaInput = Omit<CriteriaSearch, "pref"> & { pref?: string | undefined };

export function toCriteria(s: CriteriaInput): Criteria {
  const area = (s.area in AREAS ? s.area : "hkv") as AreaId;
  const match = /^(\d{1,2}):(\d{2})$/.exec(s.time);
  const arrival = match ? clamp(Number(match[1]), 0, 23) * 60 + clamp(Number(match[2]), 0, 59) : 19 * 60 + 30;
  const day: DayType = s.day === "weekday" ? "weekday" : "weekend";
  return {
    area,
    arrival,
    day,
    hours: clamp(Math.round(Number(s.hours) || 2), 1, 8),
    budget: clamp(Math.round(Number(s.budget) || 150), BUDGET_RANGE.min, BUDGET_RANGE.max),
    walk: clamp(Math.round(Number(s.walk) || 600), WALK_RANGE.min, WALK_RANGE.max),
    pref: (["free", "both", "paid"].includes(s.pref ?? "") ? s.pref : "both") as ParkingPref,
  };
}

/** Normalised search object to pass between screens. */
export function cleanSearch(s: CriteriaInput): CriteriaSearch {
  const c = toCriteria(s);
  const hh = String(Math.floor(c.arrival / 60)).padStart(2, "0");
  const mm = String(c.arrival % 60).padStart(2, "0");
  return { area: c.area, time: `${hh}:${mm}`, day: c.day, hours: c.hours, budget: c.budget, walk: c.walk, pref: c.pref };
}

export type FixSuggestion = { label: string; patch: Partial<CriteriaSearch>; results: number };

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * One-step changes that would make at least one restaurant fit, verified by re-running the
 * ranking engine for each candidate. Used by empty states instead of generic advice.
 */
export function suggestFixes(s: CriteriaInput, max = 3): FixSuggestion[] {
  const base = cleanSearch(s);
  const c = toCriteria(base);
  const count = (patch: Partial<CriteriaSearch>) => topRecommendations(toCriteria({ ...base, ...patch }), 3).rankedCount;
  const out: FixSuggestion[] = [];
  const tryFirst = (cands: { label: string; patch: Partial<CriteriaSearch> }[]) => {
    for (const cand of cands) {
      const results = count(cand.patch);
      if (results > 0) {
        out.push({ ...cand, results });
        return;
      }
    }
  };

  if (c.pref === "free") tryFirst([{ label: "Include paid parking", patch: { pref: "both" } }]);
  tryFirst(
    Array.from({ length: c.hours - 1 }, (_, i) => c.hours - 1 - i).map((h) => ({
      label: `Shorten stay to ${h} h`,
      patch: { hours: h },
    })),
  );
  tryFirst(
    [60, 120, 180]
      .filter((d) => c.arrival - d >= 0)
      .map((d) => ({ label: `Arrive at ${formatTime(c.arrival - d)}`, patch: { time: hhmm(c.arrival - d) } })),
  );
  tryFirst(
    [300, 600, 900]
      .map((d) => Math.min(WALK_RANGE.max, c.walk + d))
      .filter((w, i, a) => w > c.walk && a.indexOf(w) === i)
      .map((w) => ({ label: `Allow ${w} m walk`, patch: { walk: w } })),
  );
  tryFirst(
    [50, 100, 200]
      .map((d) => Math.min(BUDGET_RANGE.max, c.budget + d))
      .filter((b, i, a) => b > c.budget && a.indexOf(b) === i)
      .map((b) => ({ label: `Raise budget to ₹${b}`, patch: { budget: b } })),
  );
  return out.sort((a, b) => b.results - a.results).slice(0, max);
}
