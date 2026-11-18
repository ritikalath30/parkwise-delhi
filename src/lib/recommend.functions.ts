import { createServerFn } from "@tanstack/react-start";
import { generateResponse, GatewayError } from "@lovable.dev/ai-gateway";
import { z } from "zod";
import { formatTime, topRecommendations } from "./engine";
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

export type AiExplanation = z.infer<typeof outputSchema> & { source: "ai" | "fallback"; note?: string };

export const explainRecommendations = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<AiExplanation> => {
    // Recompute on the server from the same rules so the AI only ever explains
    // verified, authorised parking that passed every filter.
    const c = toCriteria(data);
    const rec = topRecommendations(c, 3);
    if (rec.top.length === 0) {
      return { source: "fallback", summary: "No restaurant has authorised parking that fits these limits.", picks: [] };
    }

    const facts = rec.top.map((r, i) => ({
      rank: i + 1,
      id: r.restaurant.id,
      restaurant: r.restaurant.name,
      cuisine: r.restaurant.cuisine,
      rating: r.restaurant.rating,
      parking: r.best!.park.parking.name,
      parkingType: r.best!.park.parking.kind,
      operator: r.best!.park.parking.operator,
      simulatedAvailabilityPct: r.best!.park.availabilityPct,
      simulatedFreeSpots: r.best!.park.freeSpots,
      costRupees: r.best!.park.cost,
      walkMetres: r.best!.walkM,
      walkMinutes: r.best!.walkMin,
      expectedSearchMinutes: r.best!.park.searchMin,
      score: r.best!.score,
    }));

    const context = {
      area: rec.area.name,
      arrival: `${formatTime(c.arrival)} on a ${c.day}`,
      stayHours: c.hours,
      parkingBudgetRupees: c.budget,
      maxWalkMetres: c.walk,
      unverifiedSpotsExcluded: rec.excludedUnverified,
    };

    try {
      const res = await generateResponse({
        model: "openai/gpt-6-astra",
        instructions:
          "You are ParkWise GeoAI, a friendly Delhi parking assistant. Explain restaurant recommendations using ONLY the numbers provided. Parking availability is simulated, never call it live. Only mention the authorised parking facilities given; never suggest roadside, informal or unverified parking. Be concise, warm and concrete. Use ₹ for rupees.",
        input: [
          {
            role: "user",
            content: `Trip: ${JSON.stringify(context)}\nTop picks (already ranked): ${JSON.stringify(facts)}\n\nReturn JSON with this exact shape: {"summary": string (1-2 sentences comparing the three), "picks": [{"id": string (same id), "headline": string (max 8 words), "reasoning": string (2-3 sentences citing availability %, cost, walk and search time vs. the user's limits), "tip": string (one practical arrival tip, max 20 words)}]}. Return JSON.`,
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
      return { ...parsed, source: "ai" };
    } catch (err) {
      if (err instanceof GatewayError) {
        console.error("AI explanation failed", err.code, err.httpStatus, err.ids);
      } else {
        console.error("AI explanation failed", err);
      }
      return {
        source: "fallback",
        note: "AI explanation is unavailable right now — showing rule-based reasoning instead.",
        summary: `Ranked by simulated availability, cost, walking distance and search time for ${context.area}.`,
        picks: facts.map((f) => ({
          id: f.id,
          headline: `${f.simulatedAvailabilityPct}% free, ${f.walkMinutes}-min walk`,
          reasoning: `${f.parking} is expected to have about ${f.simulatedFreeSpots} free spots (${f.simulatedAvailabilityPct}%), costs ₹${f.costRupees} for ${c.hours} h and is a ${f.walkMetres} m walk. Expect around ${f.expectedSearchMinutes} min to find a spot.`,
          tip: "Arrive 10–15 minutes early on busy evenings.",
        })),
      };
    }
  });
