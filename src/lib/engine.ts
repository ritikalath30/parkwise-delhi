import { getArea, type Area, type AreaId, type Parking, type Restaurant } from "./data";

export type ParkingPref = "free" | "both" | "paid";

export type DayType = "weekday" | "weekend";

export type Criteria = {
  area: AreaId;
  /** Arrival time, minutes after midnight */
  arrival: number;
  day: DayType;
  /** Planned stay in hours */
  hours: number;
  /** Max parking spend in ₹ for the whole stay */
  budget: number;
  /** Max walking distance in metres */
  walk: number;
  /** free = ₹0 parking only; both = compare free & paid; paid = paid is fine, favour convenience */
  pref: ParkingPref;
};

export type ParkingStatus = "good" | "limited" | "scarce" | "closed";

export type ParkingEval = {
  parking: Parking;
  occupancy: number;
  availabilityPct: number;
  freeSpots: number;
  cost: number;
  searchMin: number;
  status: ParkingStatus;
  open: boolean;
};

export type Option = {
  park: ParkingEval;
  /** Estimated walking-route distance (straight line × street factor) */
  walkM: number;
  /** Great-circle (haversine) distance */
  straightM: number;
  walkMin: number;
  score: number;
  breakdown: Record<FactorKey, number>;
  weights: Weights;
  eligible: boolean;
  issues: string[];
};

export type RestaurantEval = {
  restaurant: Restaurant;
  options: Option[];
  best: Option | null;
  eligible: boolean;
};

export type AreaEval = {
  area: Area;
  parkings: ParkingEval[];
  restaurants: RestaurantEval[];
  excludedUnverified: number;
  /** Unverified / restricted spaces — shown on the map as warnings, never recommended. */
  excluded: Parking[];
};

export type FactorKey = "availability" | "cost" | "walk" | "search" | "authorisation";
export type Weights = Record<FactorKey, number>;

/** Base GeoAI weights (sum = 1). "Paid is acceptable" shifts weight from cost to convenience. */
export const WEIGHTS: Weights = { availability: 0.32, cost: 0.23, walk: 0.23, search: 0.15, authorisation: 0.07 };
export const PAID_OK_WEIGHTS: Weights = { availability: 0.38, cost: 0.1, walk: 0.28, search: 0.17, authorisation: 0.07 };
export function weightsFor(pref: ParkingPref): Weights {
  return pref === "paid" ? PAID_OK_WEIGHTS : WEIGHTS;
}

/** Only authorised facilities, or shared parking with explicit owner permission, are ever recommendable. */
export function isRecommendable(p: Parking) {
  return p.authorisation === "authorised" || p.authorisation === "shared-permission";
}
const WALK_SPEED_M_PER_MIN = 75;
const ROUTE_FACTOR = 1.3; // street network vs straight line

export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function walkingDistanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  return Math.max(40, Math.round((haversineM(a, b) * ROUTE_FACTOR) / 10) * 10);
}

export function parkingCost(p: Parking, hours: number) {
  const h = Math.max(1, Math.ceil(hours));
  const raw = p.firstHour + (h - 1) * p.perHourAfter;
  return p.dailyMax ? Math.min(raw, p.dailyMax) : raw;
}

function demandAt(area: Area, day: DayType, minutes: number) {
  const curve = area.demand[day];
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const t = (m % 60) / 60;
  const a = curve[h] ?? 0;
  const b = curve[(h + 1) % 24] ?? a;
  return a + (b - a) * t;
}

/** The whole stay must fall inside opening hours, otherwise the car could be locked in. */
export function isOpenForStay(p: Parking, minutes: number, hours: number) {
  const start = minutes / 60;
  return start >= p.openFrom && start + hours <= p.openTo;
}

export function formatHour(h: number) {
  return h >= 24 ? "midnight" : formatTime(Math.round(h * 60));
}

export function evaluateParking(area: Area, p: Parking, c: Criteria): ParkingEval {
  const open = isOpenForStay(p, c.arrival, c.hours);
  // Spatiotemporal estimate from synthetic history: area curve × facility popularity,
  // blending demand at arrival (75%) with average demand across the stay (25%).
  const steps = Math.max(1, Math.round(c.hours * 2));
  let stayAvg = 0;
  for (let i = 0; i < steps; i++) stayAvg += demandAt(area, c.day, c.arrival + (i * 60 * c.hours) / steps);
  stayAvg /= steps;
  const demand = 0.75 * demandAt(area, c.day, c.arrival) + 0.25 * stayAvg;
  const occupancy = Math.min(0.99, Math.max(0.03, demand * p.demandFactor));
  // Spots first, then % from spots, so "x free of capacity" and "% free" always agree.
  const freeSpots = open ? Math.max(0, Math.round(p.capacity * (1 - occupancy))) : 0;
  const availabilityPct = open ? Math.round((freeSpots / p.capacity) * 100) : 0;
  // Expected minutes spent queuing / circling inside the facility
  const searchMin = open ? Math.round(1 + 14 * occupancy ** 4 + (occupancy > 0.9 ? 5 : 0)) : 99;
  const status: ParkingStatus = !open
    ? "closed"
    : availabilityPct >= 35
      ? "good"
      : availabilityPct >= 15
        ? "limited"
        : "scarce";
  return { parking: p, occupancy, availabilityPct, freeSpots, cost: parkingCost(p, c.hours), searchMin, status, open };
}

function scoreOption(pe: ParkingEval, walkM: number, c: Criteria) {
  const W = weightsFor(c.pref);
  const authorisation = pe.parking.authorisation === "authorised" ? 1 : 0.6;
  const availability = pe.open ? pe.availabilityPct / 100 : 0;
  const cost = c.budget > 0 ? Math.max(0, 1 - pe.cost / c.budget) : pe.cost === 0 ? 1 : 0;
  const walk = Math.max(0, 1 - walkM / Math.max(c.walk, 1));
  const search = Math.max(0, 1 - Math.min(pe.searchMin, 20) / 20);
  const breakdown = { availability, cost, walk, search, authorisation };
  const score = 100 * (Object.keys(W) as FactorKey[]).reduce((t, k) => t + W[k] * breakdown[k], 0);
  return { score: Math.round(score), breakdown, weights: W };
}

export function evaluateArea(c: Criteria): AreaEval {
  const area = getArea(c.area);
  // Rule: unverified / unauthorised parking is never evaluated or recommended.
  const verified = area.parkings.filter(isRecommendable);
  const excluded = area.parkings.filter((p) => !isRecommendable(p));
  const parkings = verified.map((p) => evaluateParking(area, p, c));

  const restaurants = area.restaurants.map<RestaurantEval>((r) => {
    const options = parkings
      .map<Option>((pe) => {
        const walkM = walkingDistanceM(r, pe.parking);
        const straightM = Math.round(haversineM(r, pe.parking) / 10) * 10;
        const issues: string[] = [];
        if (c.pref === "free" && pe.cost > 0) issues.push(`Paid (₹${pe.cost}) — excluded by your free-only preference`);
        if (!pe.open) {
          const start = c.arrival / 60;
          issues.push(
            start < pe.parking.openFrom
              ? `Opens at ${formatHour(pe.parking.openFrom)}, after you arrive`
              : `Closes at ${formatHour(pe.parking.openTo)}, before your ${c.hours} h stay ends`,
          );
        }
        if (walkM > c.walk) issues.push(`Walk ${walkM} m exceeds your ${c.walk} m limit`);
        if (pe.cost > c.budget) issues.push(`₹${pe.cost} exceeds your ₹${c.budget} budget`);
        if (pe.open && pe.freeSpots === 0) issues.push("Expected to be full");
        const { score, breakdown, weights } = scoreOption(pe, walkM, c);
        return {
          park: pe,
          walkM,
          straightM,
          weights,
          walkMin: Math.max(1, Math.round(walkM / WALK_SPEED_M_PER_MIN)),
          score,
          breakdown,
          eligible: issues.length === 0,
          issues,
        };
      })
      .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
    const best = options.find((o) => o.eligible) ?? null;
    return { restaurant: r, options, best, eligible: best !== null };
  });

  return {
    area,
    parkings,
    restaurants,
    excludedUnverified: excluded.length,
    excluded,
  };
}

export function topRecommendations(c: Criteria, n = 3) {
  const ev = evaluateArea(c);
  const ranked = ev.restaurants
    .filter((r) => r.eligible && r.best)
    .sort((a, b) => b.best!.score - a.best!.score || b.restaurant.rating - a.restaurant.rating);
  return { ...ev, top: ranked.slice(0, n), rankedCount: ranked.length };
}

const FACTOR_LABEL: Record<FactorKey, string> = {
  availability: "simulated availability",
  cost: "parking cost",
  walk: "walking distance",
  search: "search time",
  authorisation: "authorisation status",
};

/** Weighted points each factor contributes to an option's score. */
export function contributions(o: Option): Record<FactorKey, number> {
  const out = {} as Record<FactorKey, number>;
  for (const k of Object.keys(o.weights) as FactorKey[]) out[k] = 100 * o.weights[k] * o.breakdown[k];
  return out;
}

function describeFactor(k: FactorKey, a: Option, b: Option) {
  switch (k) {
    case "availability":
      return `${Math.abs(a.park.availabilityPct - b.park.availabilityPct)} points ${a.park.availabilityPct > b.park.availabilityPct ? "more" : "less"} simulated availability`;
    case "cost":
      if (a.park.cost === 0 && b.park.cost > 0) return `free parking versus ₹${b.park.cost}`;
      if (b.park.cost === 0 && a.park.cost > 0) return `₹${a.park.cost} parking versus free`;
      return `₹${Math.abs(a.park.cost - b.park.cost)} ${a.park.cost < b.park.cost ? "cheaper" : "dearer"} parking`;
    case "authorisation":
      return a.park.parking.authorisation === "authorised" ? "a fully authorised facility versus shared parking" : "shared (owner-permitted) parking versus an authorised facility";
    case "walk":
      return `${Math.abs(a.walkM - b.walkM)} m ${a.walkM < b.walkM ? "shorter" : "longer"} walk`;
    case "search":
      return `${Math.abs(a.park.searchMin - b.park.searchMin)} min ${a.park.searchMin < b.park.searchMin ? "less" : "more"} searching`;
  }
}

/** Biggest factor where `a` beats `b` (or loses to it with sign = -1). */
function keyFactor(a: Option, b: Option, sign: 1 | -1): FactorKey | null {
  const ca = contributions(a);
  const cb = contributions(b);
  let best: FactorKey | null = null;
  let bestGap = 0.5; // ignore sub-point differences
  for (const k of Object.keys(FACTOR_LABEL) as FactorKey[]) {
    const gap = sign * (ca[k] - cb[k]);
    if (gap > bestGap) {
      bestGap = gap;
      best = k;
    }
  }
  return best;
}

/**
 * Plain-language reason for each rank, comparing every pick with its neighbours.
 * `ranked` must be sorted best-first and contain only eligible restaurants.
 */
export function rankReasons(ranked: RestaurantEval[], n = 3): string[] {
  return ranked.slice(0, n).map((r, i) => {
    const o = r.best!;
    const above = i > 0 ? ranked[i - 1] : undefined;
    const below = ranked[i + 1];
    const parts: string[] = [];
    if (!above) {
      parts.push(`Ranked #1 with the highest score (${o.score}/100)`);
    } else {
      const ao = above.best!;
      if (ao.score === o.score) {
        parts.push(`Ranked #${i + 1}: ties with ${above.restaurant.name} on ${o.score}/100 but has a lower rating (${r.restaurant.rating} vs ${above.restaurant.rating})`);
      } else {
        const lose = keyFactor(o, ao, -1);
        parts.push(
          `Ranked #${i + 1} (${o.score}/100), ${ao.score - o.score} points behind ${above.restaurant.name}` +
            (lose ? ` mainly due to ${describeFactor(lose, o, ao)}` : ""),
        );
      }
    }
    if (below?.best) {
      const bo = below.best;
      if (bo.score === o.score) {
        parts.push(`edges ${below.restaurant.name} on rating (${r.restaurant.rating} vs ${below.restaurant.rating})`);
      } else {
        const win = keyFactor(o, bo, 1);
        parts.push(
          `ahead of ${below.restaurant.name} by ${o.score - bo.score} points` + (win ? ` thanks to ${describeFactor(win, o, bo)}` : ""),
        );
      }
    }
    return parts.join("; ") + ".";
  });
}

export function formatTime(minutes: number) {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function statusLabel(s: ParkingStatus) {
  return { good: "Good availability", limited: "Limited spots", scarce: "Nearly full", closed: "Closed" }[s];
}
