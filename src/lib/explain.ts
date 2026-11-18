import { formatTime, rankReasons, topRecommendations, type Criteria } from "./engine";

export type PickExplanation = { id: string; headline: string; reasoning: string; tip: string; rankReason: string };
export type Explanation = { summary: string; picks: PickExplanation[] };

/** Rule-based explanation, shown instantly and used whenever the AI is unavailable. */
export function ruleBasedExplanation(c: Criteria): Explanation {
  const rec = topRecommendations(c, 3);
  const ranked = rec.restaurants
    .filter((r) => r.eligible && r.best)
    .sort((a, b) => b.best!.score - a.best!.score || b.restaurant.rating - a.restaurant.rating);
  const reasons = rankReasons(ranked, 3);
  if (rec.top.length === 0) {
    return { summary: "No restaurant has authorised parking that fits these limits.", picks: [] };
  }
  const first = rec.top[0]!;
  return {
    summary: `For a ${formatTime(c.arrival)} ${c.day} arrival, ${first.restaurant.name} scores best (${first.best!.score}/100) with ${first.best!.park.parking.name}: ${first.best!.park.availabilityPct}% simulated availability, ₹${first.best!.park.cost} and a ${first.best!.walkM} m walk.`,
    picks: rec.top.map((r, i) => {
      const o = r.best!;
      return {
        id: r.restaurant.id,
        headline: `${o.park.availabilityPct}% free, ₹${o.park.cost}, ${o.walkMin}-min walk`,
        reasoning: `${o.park.parking.name} is expected to have about ${o.park.freeSpots} of ${o.park.parking.capacity} spots free (${o.park.availabilityPct}%, simulated). It costs ₹${o.park.cost} for ${c.hours} h (budget ₹${c.budget}) and is a ${o.walkM} m walk (limit ${c.walk} m), with roughly ${o.park.searchMin} min to find a spot.`,
        tip:
          o.park.status === "scarce"
            ? "Very busy at this time — arrive 15 minutes early or try an earlier slot."
            : o.park.status === "limited"
              ? "Spots are limited — aim to arrive 10 minutes early."
              : "Plenty of space expected — no need to arrive early.",
        rankReason: reasons[i] ?? "",
      };
    }),
  };
}
