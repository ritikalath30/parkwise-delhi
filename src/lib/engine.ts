// ParkWise recommendation engine — pure and deterministic, shared by the Explore and Plan screens.
// 1. Eligibility filters run first (public access is already guaranteed by the data layer):
//    preference → opening hours for the whole stay → walking limit → budget (when the price is known).
// 2. Eligible options are ranked internally; users only see plain-language tags, never scores.
import { availabilityFor, type Availability, type AvailabilityContext } from "./availability";
import { estimatedWalkM, haversineM, WALK_M_PER_MIN } from "./geo";
import { chargeFor, chargeLabel } from "./places/charge";
import { coversSpan, isOpenAt, weekdayIndex } from "./places/hours";
import type { Parking, PlaceData, Restaurant } from "./places/types";

export type Pref = "free" | "paid" | "both";

export type Criteria = {
  /** Arrival date, YYYY-MM-DD */
  dateISO: string;
  /** Arrival at the parking, minutes after midnight */
  arrival: number;
  /** Planned stay in hours */
  hours: number;
  /** Max parking spend in ₹ for the whole stay */
  budget: number;
  /** Max walk from parking to restaurant, metres */
  walk: number;
  pref: Pref;
};

export type Blocker = "pref" | "hours" | "walk" | "budget";
export type OptionTag = "best-match" | "cheapest" | "closest-available" | "shortest-walk";

export const TAG_LABEL: Record<OptionTag, string> = {
  "best-match": "Best match",
  cheapest: "Cheapest",
  "closest-available": "Closest with likely spaces",
  "shortest-walk": "Shortest walk",
};

export type Option = {
  parking: Parking;
  walkM: number;
  walkSource: "route" | "estimate";
  straightM: number;
  walkMin: number;
  /** ₹ for the stay; null = price unknown */
  cost: number | null;
  costLabel: string;
  availability: Availability;
  /** null = opening hours unknown */
  openForStay: boolean | null;
  eligible: boolean;
  issues: string[];
  blockers: Blocker[];
  tags: OptionTag[];
  /** Internal ordering only — never displayed. */
  rank: number;
};

export type RestaurantEval = {
  restaurant: Restaurant;
  distanceM: number;
  /** null = hours unknown */
  openAtArrival: boolean | null;
  options: Option[];
  best: Option | null;
  eligible: boolean;
  reason: string;
};

export type Evaluation = {
  restaurants: RestaurantEval[];
  top: RestaurantEval[];
  eligibleCombos: number;
  totalCombos: number;
};

export type EngineInput = Pick<PlaceData, "center" | "restaurants" | "parkings" | "routes" | "activityCount">;

export const routeKey = (parkingId: string, restaurantId: string) => `${parkingId}>${restaurantId}`;

function prefAllows(p: Parking, pref: Pref) {
  if (pref === "free") return p.category === "free";
  if (pref === "paid") return p.category !== "free";
  return true;
}

const AVAIL_SCORE = { low: 1, moderate: 0.7, high: 0.35, "very-high": 0.05 } as const;

function rankOf(o: Pick<Option, "walkM" | "availability" | "cost" | "openForStay" | "parking">) {
  const walk = Math.max(0, 1 - o.walkM / 1500);
  const avail = o.availability.level ? AVAIL_SCORE[o.availability.level] : 0.5;
  const cost = o.cost === null ? 0.4 : 1 - Math.min(o.cost, 300) / 300;
  const info = (o.parking.fee !== "unknown" ? 0.5 : 0) + (o.openForStay !== null ? 0.5 : 0);
  return 0.45 * walk + 0.3 * avail + 0.15 * cost + 0.1 * info;
}

export function formatTime(min: number) {
  const h = Math.floor(min / 60) % 24;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(min % 60).padStart(2, "0")} ${h >= 12 ? "pm" : "am"}`;
}

export function evaluate(data: EngineInput, c: Criteria): Evaluation {
  const day = weekdayIndex(c.dateISO);
  const ctx: AvailabilityContext = { dateISO: c.dateISO, arrivalMin: c.arrival, hours: c.hours, activityCount: data.activityCount };
  const perParking = data.parkings.map((p) => ({
    p,
    availability: availabilityFor(p, ctx),
    cost: chargeFor(p.fee, p.charge, c.hours),
    costLabel: chargeLabel(p.fee, p.charge, p.chargeRaw),
    openForStay: p.hours ? coversSpan(p.hours, day, c.arrival, Math.round(c.hours * 60)) : null,
  }));

  let eligibleCombos = 0;
  const restaurants = data.restaurants.map<RestaurantEval>((r) => {
    const openAtArrival = r.hours ? isOpenAt(r.hours, day, c.arrival) : null;
    const options = perParking.map<Option>(({ p, availability, cost, costLabel, openForStay }) => {
      const straightM = Math.round(haversineM(r, p) / 10) * 10;
      const routeM = data.routes?.[routeKey(p.id, r.id)];
      const walkSource = routeM !== undefined ? "route" : "estimate";
      // OSRM measures between points snapped to streets; never report less than the straight line.
      const walkM = routeM !== undefined ? Math.max(straightM, Math.round(routeM / 10) * 10) : estimatedWalkM(r, p);
      const issues: string[] = [];
      const blockers: Blocker[] = [];
      if (!prefAllows(p, c.pref)) {
        blockers.push("pref");
        issues.push(c.pref === "free" ? (p.category === "paid" ? "Paid parking" : "Not confirmed as free") : "Free parking (you chose paid)");
      }
      if (openForStay === false) {
        blockers.push("hours");
        issues.push(`Not open for your whole stay (${p.openingHours})`);
      }
      if (walkM > c.walk) {
        blockers.push("walk");
        issues.push(`${walkM} m walk is over your ${c.walk} m limit`);
      }
      if (cost !== null && cost > c.budget) {
        blockers.push("budget");
        issues.push(`₹${cost} is over your ₹${c.budget} budget`);
      }
      const o: Option = {
        parking: p,
        walkM,
        walkSource,
        straightM,
        walkMin: Math.max(1, Math.round(walkM / WALK_M_PER_MIN)),
        cost,
        costLabel,
        availability,
        openForStay,
        eligible: blockers.length === 0,
        issues,
        blockers,
        tags: [],
        rank: 0,
      };
      o.rank = rankOf(o);
      return o;
    });
    options.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.rank - a.rank || a.walkM - b.walkM);
    const eligibleOpts = options.filter((o) => o.eligible);
    tagOptions(eligibleOpts);
    eligibleCombos += eligibleOpts.length;
    const best = openAtArrival === false ? null : (eligibleOpts[0] ?? null);
    const reason =
      openAtArrival === false ? `Closed at ${formatTime(c.arrival)} (${r.openingHours})` : best ? describe(best) : nearestIssue(options, c);
    return { restaurant: r, distanceM: Math.round(haversineM(data.center, r)), openAtArrival, options, best, eligible: best !== null, reason };
  });

  restaurants.sort(
    (a, b) => Number(b.eligible) - Number(a.eligible) || (b.best?.rank ?? 0) - (a.best?.rank ?? 0) || a.distanceM - b.distanceM,
  );
  return {
    restaurants,
    top: restaurants.filter((r) => r.eligible).slice(0, 3),
    eligibleCombos,
    totalCombos: data.restaurants.length * data.parkings.length,
  };
}

function tagOptions(opts: Option[]) {
  if (!opts.length) return;
  opts[0]!.tags.push("best-match");
  const known = opts.filter((o) => o.cost !== null);
  if (known.length) {
    const min = Math.min(...known.map((o) => o.cost!));
    known.filter((o) => o.cost === min).sort((a, b) => a.walkM - b.walkM)[0]!.tags.push("cheapest");
  }
  const byWalk = [...opts].sort((a, b) => a.walkM - b.walkM);
  const avail = byWalk.find((o) => o.availability.level === "low" || o.availability.level === "moderate");
  if (avail) avail.tags.push("closest-available");
  if (byWalk[0] && byWalk[0] !== avail) byWalk[0].tags.push("shortest-walk");
}

/** One plain line, e.g. "Free · 220 m walk · likely spaces (predicted)". */
export function describe(o: Option) {
  const price = o.cost === 0 ? "Free" : o.cost !== null ? `₹${o.cost}` : "Price unknown";
  const avail = o.availability.kind === "unknown" ? "availability unknown" : `${o.availability.label.toLowerCase()} (${o.availability.kind === "image-estimate" ? "image estimate" : o.availability.kind})`;
  return `${price} · ${o.walkM} m walk · ${avail}`;
}

function nearestIssue(options: Option[], c: Criteria) {
  if (!options.length) return "No public parking found nearby";
  if (c.pref === "free" && options.every((o) => o.blockers.includes("pref"))) return "No confirmed free parking nearby";
  const closest = [...options].sort((a, b) => a.walkM - b.walkM)[0]!;
  return `No parking fits — nearest is ${closest.walkM} m away: ${closest.issues[0] ?? "—"}`;
}

export type FixSuggestion = { label: string; patch: Partial<Criteria>; results: number };

/** One-step changes that make at least one restaurant fit, verified by re-running the engine. */
export function suggestFixes(data: EngineInput, c: Criteria, max = 3): FixSuggestion[] {
  const count = (patch: Partial<Criteria>) => evaluate(data, { ...c, ...patch }).restaurants.filter((r) => r.eligible).length;
  const out: FixSuggestion[] = [];
  const first = (cands: { label: string; patch: Partial<Criteria> }[]) => {
    for (const cand of cands) {
      const n = count(cand.patch);
      if (n > 0) {
        out.push({ ...cand, results: n });
        return;
      }
    }
  };
  if (c.pref === "free") first([{ label: "Include paid parking", patch: { pref: "both" } }]);
  first(
    [300, 600, 900]
      .map((d) => Math.min(1500, c.walk + d))
      .filter((w, i, a) => w > c.walk && a.indexOf(w) === i)
      .map((w) => ({ label: `Allow ${w} m walk`, patch: { walk: w } })),
  );
  first(
    [50, 100, 200]
      .map((d) => Math.min(400, c.budget + d))
      .filter((b, i, a) => b > c.budget && a.indexOf(b) === i)
      .map((b) => ({ label: `Raise budget to ₹${b}`, patch: { budget: b } })),
  );
  first(
    Array.from({ length: Math.max(0, Math.ceil(c.hours) - 1) }, (_, i) => Math.ceil(c.hours) - 1 - i).map((h) => ({
      label: `Shorten stay to ${h} h`,
      patch: { hours: h },
    })),
  );
  first(
    [-60, -120, 60]
      .filter((d) => c.arrival + d >= 0 && c.arrival + d < 1440)
      .map((d) => ({ label: `Arrive at ${formatTime(c.arrival + d)}`, patch: { arrival: c.arrival + d } })),
  );
  return out.sort((a, b) => b.results - a.results).slice(0, max);
}
