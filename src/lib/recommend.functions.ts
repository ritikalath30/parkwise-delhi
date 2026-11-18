import { createServerFn } from "@tanstack/react-start";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import { z } from "zod";
import { formatTime, topRecommendations } from "./engine";
import { ruleBasedExplanation } from "./explain";
import { toCriteria } from "./search";

const inputSchema = z.object({
  area: z.string().max(20),
  time: z.string().max(5),
  day: z.string().max(10),
  hours: z.number(),
  budget: z.number(),
  walk: z.number(),
});

const outputSchema = z.object({
  summary: z.string(),
  picks: z.array(z.object({ id: z.string(), headline: z.string(), reasoning: z.string(), tip: z.string() })),
});

export type AiExplanation = {
  source: "ai" | "fallback";
  note?: string;
  summary: string;
  picks: { id: string; headline: string; reasoning: string; tip: string; rankReason: string }[];
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
      capacity: r.best!.park.parking.capacity,
      simulatedFreeSpots: r.best!.park.freeSpots,
      simulatedAvailabilityPct: r.best!.park.availabilityPct,
      costRupees: r.best!.park.cost,
      walkMetres: r.best!.walkM,
      walkMinutes: r.best!.walkMin,
      expectedSearchMinutes: r.best!.park.searchMin,
      score: r.best!.score,
      whyThisRank: rules.picks[i]?.rankReason,
    }));

    const context = {
      area: rec.area.name,
      arrival: `${formatTime(c.arrival)} on a ${c.day}`,
      stayHours: c.hours,
      parkingBudgetRupees: c.budget,
      maxWalkMetres: c.walk,
      scoreWeights: "availability 35%, cost 25%, walk 25%, search time 15%",
    };

    try {
      const res = await generateResponse({
        model: "openai/gpt-6-astra",
        instructions:
          "You are ParkWise GeoAI, a friendly Delhi parking assistant. Explain restaurant recommendations using ONLY the numbers provided — never invent figures. Parking availability is simulated; never call it live. Only mention the authorised parking facilities given; never suggest roadside, informal or unverified parking. Be concise, warm and concrete. Use ₹ for rupees.",
        input: [
          {
            role: "user",
            content: `Trip: ${JSON.stringify(context)}\nTop picks (already ranked, with the reason for each rank): ${JSON.stringify(facts)}\n\nReturn JSON with this exact shape: {"summary": string (1-2 sentences on why #1 beats #2 and #3), "picks": [{"id": string (same id), "headline": string (max 8 words), "reasoning": string (2-3 sentences: why it holds THIS rank versus the picks above/below, citing availability %, cost, walk and search time vs. the user's limits), "tip": string (one practical arrival tip, max 20 words)}]}. Return JSON.`,
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
      // Keep the rule-based order and rank reasons; take AI wording only for known ids.
      const picks = rules.picks.map((rp) => {
        const ai = parsed.picks.find((p) => p.id === rp.id);
        return ai ? { ...ai, id: rp.id, rankReason: rp.rankReason } : rp;
      });
      return { source: "ai", summary: parsed.summary, picks };
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
