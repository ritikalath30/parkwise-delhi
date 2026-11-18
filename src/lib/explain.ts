import { formatTime, rankReasons, topRecommendations, type Criteria, type Option, type RestaurantEval, type RouteMatrix } from "./engine";
import { SAFETY_BAND_LABEL } from "./safety";

export type PickExplanation = {
  id: string;
  headline: string;
  reasoning: string;
  tip: string;
  rankReason: string;
  /** Free-vs-paid trade-off for this restaurant, computed from eligible options. */
  tradeoff: string;
};
export type Explanation = { summary: string; picks: PickExplanation[] };

export function accessLabel(o: Option) {
  const a = o.park.parking.access;
  return a === "free" ? "free authorised" : a === "shared" ? "owner-permitted shared" : "paid authorised";
}

/** Compare the best free and best paid eligible options for one restaurant. */
export function freePaidTradeoff(r: RestaurantEval, c: Criteria): string {
  const eligible = r.options.filter((o) => o.eligible);
  const free = eligible.find((o) => o.park.cost === 0);
  const paid = eligible.find((o) => o.park.cost > 0);
  if (c.pref === "free") {
    return free
      ? `Free-only: ${free.park.parking.name} costs ₹0 (${free.park.availabilityPct}% simulated availability, ${free.walkM} m walk).`
      : "No verified free parking fits your limits for this restaurant.";
  }
  if (free && paid) {
    const walkDiff = free.walkM - paid.walkM;
    const availDiff = free.park.availabilityPct - paid.park.availabilityPct;
    return `Free option ${free.park.parking.name} saves ₹${paid.park.cost} but ${walkDiff > 0 ? `adds ${walkDiff} m of walking` : `is ${-walkDiff} m closer`} and has ${availDiff >= 0 ? `${availDiff} points more` : `${-availDiff} points less`} simulated availability than paid ${paid.park.parking.name}.`;
  }
  if (free) return `Only free parking fits: ${free.park.parking.name} (₹0).`;
  if (paid) return `No verified free parking within your limits — cheapest fitting paid option is ₹${Math.min(...eligible.map((o) => o.park.cost))}.`;
  return "";
}

/** Rule-based explanation, shown instantly and used whenever the AI is unavailable. */
export function ruleBasedExplanation(c: Criteria, routes?: RouteMatrix | null): Explanation {
  const rec = topRecommendations(c, 3, routes);
  const ranked = rec.restaurants
    .filter((r) => r.eligible && r.best)
    .sort((a, b) => b.best!.score - a.best!.score || b.restaurant.rating - a.restaurant.rating);
  const reasons = rankReasons(ranked, 3);
  if (rec.top.length === 0) {
    return {
      summary:
        c.pref === "free"
          ? "No restaurant has verified free parking that fits these limits. Try 'Free + paid' or a longer walk."
          : "No restaurant has authorised parking that fits these limits.",
      picks: [],
    };
  }
  const first = rec.top[0]!;
  const fo = first.best!;
  return {
    summary: `${first.restaurant.name} scores best (${fo.score}/100) for a ${formatTime(c.arrival)} ${c.day} arrival: ${accessLabel(fo)} ${fo.park.parking.name}, ${fo.park.cost === 0 ? "free" : `₹${fo.park.cost}`}, ${fo.park.availabilityPct}% simulated availability, safety ${fo.park.safety.score}/100, ~${fo.walkM} m walk. ${rec.rankedCount} restaurant${rec.rankedCount === 1 ? "" : "s"} fit your filters.`,
    picks: rec.top.map((r, i) => {
      const o = r.best!;
      return {
        id: r.restaurant.id,
        headline: `${o.park.cost === 0 ? "Free" : `₹${o.park.cost}`} · ${o.park.availabilityPct}% free · safety ${o.park.safety.score}`,
        reasoning: `${o.park.parking.name} (${accessLabel(o)}) expects ~${o.park.freeSpots} of ${o.park.parking.capacity} spots free and ~${o.park.searchMin} min to park. ${o.park.cost === 0 ? "Free" : `₹${o.park.cost}`} for ${c.hours} h, ~${o.walkM} m ${o.walkSource === "route" ? "OSM walking route" : "estimated walk"}. ${SAFETY_BAND_LABEL[o.park.safety.band]} (${o.park.safety.score}/100, synthetic).`,
        tip:
          o.park.parking.access === "shared"
            ? o.park.parking.note ?? "Shared parking: follow the owner's entry instructions."
            : o.park.status === "scarce"
              ? "Very busy at this time — arrive 15 minutes early or try an earlier slot."
              : o.park.status === "limited"
                ? "Spots are limited — aim to arrive 10 minutes early."
                : "Plenty of space expected — no need to arrive early.",
        rankReason: reasons[i] ?? "",
        tradeoff: freePaidTradeoff(r, c),
      };
    }),
  };
}

/** Every number found in a value (including numbers embedded in strings), recursively. */
export function collectNumbers(value: unknown, into = new Set<number>()): Set<number> {
  if (typeof value === "number" && Number.isFinite(value)) into.add(value);
  else if (typeof value === "string") for (const m of value.matchAll(/\d+(?:\.\d+)?/g)) into.add(Number(m[0]));
  else if (Array.isArray(value)) for (const v of value) collectNumbers(v, into);
  else if (value && typeof value === "object") for (const v of Object.values(value)) collectNumbers(v, into);
  return into;
}

/**
 * True when every number in `text` (other than small counts 0–10) appears in the facts the AI
 * was given. Used to reject AI wording that invents or miscopies figures.
 */
export function numbersGrounded(text: string, allowed: Set<number>): boolean {
  for (const m of text.replace(/,(?=\d{3})/g, "").matchAll(/\d+(?:\.\d+)?/g)) {
    const n = Number(m[0]);
    if (n <= 10) continue;
    if (!allowed.has(n)) return false;
  }
  return true;
}
