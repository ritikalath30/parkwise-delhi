import { getArea, type Area, type AreaId, type Parking, type Restaurant } from "./data";

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
  walkM: number;
  walkMin: number;
  score: number;
  breakdown: { availability: number; cost: number; walk: number; search: number };
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
};

export const WEIGHTS = { availability: 0.35, cost: 0.25, walk: 0.25, search: 0.15 } as const;
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
  const occupancy = Math.min(0.99, Math.max(0.03, demandAt(area, c.day, c.arrival) * p.demandFactor));
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
  const availability = pe.open ? pe.availabilityPct / 100 : 0;
  const cost = c.budget > 0 ? Math.max(0, 1 - pe.cost / c.budget) : pe.cost === 0 ? 1 : 0;
  const walk = Math.max(0, 1 - walkM / Math.max(c.walk, 1));
  const search = Math.max(0, 1 - Math.min(pe.searchMin, 20) / 20);
  const score =
    100 *
    (WEIGHTS.availability * availability + WEIGHTS.cost * cost + WEIGHTS.walk * walk + WEIGHTS.search * search);
  return { score: Math.round(score), breakdown: { availability, cost, walk, search } };
}

export function evaluateArea(c: Criteria): AreaEval {
  const area = getArea(c.area);
  // Rule: unverified / unauthorised parking is never evaluated or recommended.
  const verified = area.parkings.filter((p) => p.verified);
  const parkings = verified.map((p) => evaluateParking(area, p, c));

  const restaurants = area.restaurants.map<RestaurantEval>((r) => {
    const options = parkings
      .map<Option>((pe) => {
        const walkM = walkingDistanceM(r, pe.parking);
        const issues: string[] = [];
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
        const { score, breakdown } = scoreOption(pe, walkM, c);
        return {
          park: pe,
          walkM,
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
    excludedUnverified: area.parkings.length - verified.length,
  };
}

export function topRecommendations(c: Criteria, n = 3) {
  const ev = evaluateArea(c);
  const ranked = ev.restaurants
    .filter((r) => r.eligible && r.best)
    .sort((a, b) => b.best!.score - a.best!.score || b.restaurant.rating - a.restaurant.rating);
  return { ...ev, top: ranked.slice(0, n), rankedCount: ranked.length };
}

const FACTOR_LABEL = {
  availability: "simulated availability",
  cost: "parking cost",
  walk: "walking distance",
  search: "search time",
} as const;
type FactorKey = keyof typeof FACTOR_LABEL;

/** Weighted points each factor contributes to an option's score. */
export function contributions(o: Option): Record<FactorKey, number> {
  return {
    availability: 100 * WEIGHTS.availability * o.breakdown.availability,
    cost: 100 * WEIGHTS.cost * o.breakdown.cost,
    walk: 100 * WEIGHTS.walk * o.breakdown.walk,
    search: 100 * WEIGHTS.search * o.breakdown.search,
  };
}

function describeFactor(k: FactorKey, a: Option, b: Option) {
  switch (k) {
    case "availability":
      return `${Math.abs(a.park.availabilityPct - b.park.availabilityPct)} points ${a.park.availabilityPct > b.park.availabilityPct ? "more" : "less"} simulated availability`;
    case "cost":
      return `₹${Math.abs(a.park.cost - b.park.cost)} ${a.park.cost < b.park.cost ? "cheaper" : "dearer"} parking`;
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
