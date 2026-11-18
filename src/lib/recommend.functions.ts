import { createServerFn } from "@tanstack/react-start";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import { z } from "zod";
import { formatTime, topRecommendations } from "./engine";
import { collectNumbers, numbersGrounded, ruleBasedExplanation } from "./explain";
import { toCriteria } from "./search";

const inputSchema = z.object({
  area: z.string().max(20),
  time: z.string().max(5),
  day: z.string().max(10),
  hours: z.number(),
  budget: z.number(),
  walk: z.number(),
  pref: z.string().max(10).optional(),
});

const outputSchema = z.object({
  summary: z.string(),
  picks: z.array(z.object({ id: z.string(), headline: z.string(), reasoning: z.string(), tip: z.string() })),
});

export type AiExplanation = {
  source: "ai" | "fallback";
  note?: string;
  summary: string;
  picks: { id: string; headline: string; reasoning: string; tip: string; rankReason: string; tradeoff: string }[];
};

export const explainRecommendations = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<AiExplanation> => {
    // Recompute on the server from the same rules so the AI only ever explains
    // verified, authorised parking that passed every filter.
    const c = toCriteria(data);
    const rec = topRecommendations(c, 3);
    const rules = ruleBasedExplanation(c);
    if (rec.top.length === 0) return { source: "fallback", ...rules };

    const facts = rec.top.map((r, i) => ({
      rank: i + 1,
      id: r.restaurant.id,
      restaurant: r.restaurant.name,
      cuisine: r.restaurant.cuisine,
      rating: r.restaurant.rating,
      parking: r.best!.park.parking.name,
      parkingType: r.best!.park.parking.kind,
      operator: r.best!.park.parking.operator,
      access: r.best!.park.parking.access,
      authorisation: r.best!.park.parking.authorisation,
      straightLineMetres: r.best!.straightM,
      capacity: r.best!.park.parking.capacity,
      simulatedFreeSpots: r.best!.park.freeSpots,
      simulatedAvailabilityPct: r.best!.park.availabilityPct,
      costRupees: r.best!.park.cost,
      estimatedWalkRouteMetres: r.best!.walkM,
      walkMinutes: r.best!.walkMin,
      expectedSearchMinutes: r.best!.park.searchMin,
      score: r.best!.score,
      whyThisRank: rules.picks[i]?.rankReason,
      freeVsPaidTradeoff: rules.picks[i]?.tradeoff,
    }));

    const context = {
      area: rec.area.name,
      arrival: `${formatTime(c.arrival)} on a ${c.day}`,
      stayHours: c.hours,
      parkingBudgetRupees: c.budget,
      maxWalkMetres: c.walk,
      parkingPreference: c.pref === "free" ? "free parking only" : c.pref === "paid" ? "paid parking acceptable (convenience first)" : "compare free and paid",
      scoreWeights: c.pref === "paid" ? "availability 38%, cost 10%, walk 28%, search 17%, authorisation 7%" : "availability 32%, cost 23%, walk 23%, search 15%, authorisation 7%",
    };

    try {
      const res = await generateResponse({
        model: "openai/gpt-6-astra",
        instructions:
          "You are ParkWise GeoAI, a friendly Delhi parking assistant. Explain restaurant recommendations using ONLY the numbers provided — never invent figures. Parking availability is simulated; never call it live. Only mention the authorised or owner-permitted shared facilities given; never suggest roadside, restricted, informal or unverified parking, and never call a vacant roadside space legal parking. Be concise, warm and concrete. Use ₹ for rupees.",
        input: [
          {
            role: "user",
            content: `Trip: ${JSON.stringify(context)}\nTop picks (already ranked, with the reason for each rank): ${JSON.stringify(facts)}\n\nReturn JSON with this exact shape: {"summary": string (1-2 sentences on why #1 beats #2 and #3), "picks": [{"id": string (same id), "headline": string (max 8 words), "reasoning": string (3 sentences: why this restaurant was selected and holds THIS rank; why its parking facility is suitable including whether it is free, paid or owner-permitted shared; the trade-off between cost, availability and walking distance, citing the numbers), "tip": string (one practical arrival tip, max 20 words)}]}. Return JSON.`,
          },
        ],
        text: { format: { type: "json_object" } },
        reasoning: { effort: "low" },
      });

      let text = "";
      for (const item of res.output ?? []) {
        if (item.type === "message") {
          for (const part of item.content) {
            if (part.type === "output_text") text += part.text;
          }
        }
      }
      const parsed = outputSchema.parse(JSON.parse(text));
      // Any figure the AI writes must come from the facts it was given; otherwise that piece
      // falls back to the rule-based wording so explanations never contradict the numbers.
      const allowed = collectNumbers([facts, context, rules]);
      let rejected = 0;
      // Keep the rule-based order and rank reasons; take AI wording only for known ids.
      const picks = rules.picks.map((rp) => {
        const ai = parsed.picks.find((p) => p.id === rp.id);
        if (!ai) return rp;
        if (![ai.headline, ai.reasoning, ai.tip].every((t) => numbersGrounded(t, allowed))) {
          rejected++;
          return rp;
        }
        return { ...ai, id: rp.id, rankReason: rp.rankReason, tradeoff: rp.tradeoff };
      });
      const summaryOk = numbersGrounded(parsed.summary, allowed);
      if (!summaryOk) rejected++;
      return {
        source: "ai",
        summary: summaryOk ? parsed.summary : rules.summary,
        picks,
        ...(rejected > 0 && { note: `${rejected} AI passage${rejected > 1 ? "s" : ""} cited figures not in the ranking data and ${rejected > 1 ? "were" : "was"} replaced with rule-based wording.` }),
      };
    } catch (err) {
      if (err instanceof GatewayError) {
        console.error("AI explanation failed", err.code, err.httpStatus, err.ids);
      } else {
        console.error("AI explanation failed", err);
      }
      return {
        source: "fallback",
        note: "AI explanation is unavailable right now — showing rule-based reasoning instead.",
        ...rules,
      };
    }
  });
