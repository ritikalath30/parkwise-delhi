// Server-only: turns a free-text trip description into search filters.
// Claude (Anthropic API) when ANTHROPIC_API_KEY is set; otherwise the deterministic rules parser.
// The AI only interprets intent — all places, parking and routes still come from real data.
import Anthropic from "@anthropic-ai/sdk";
import { parseTripRules, type TripIntent } from "./rules";

export type ParsedTrip = TripIntent & { source: "claude" | "rules"; note: string | null };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["place", "time", "hours", "budget", "walk", "pref"],
  properties: {
    place: { type: ["string", "null"], description: "Destination, locality, landmark or restaurant in Delhi, as the user wrote it" },
    time: { type: ["string", "null"], description: "Arrival time in 24h HH:MM; 'dinner at 8' means 20:00" },
    hours: { type: ["integer", "null"], description: "How long they will park, in whole hours (1-8)" },
    budget: { type: ["integer", "null"], description: "Maximum parking spend in rupees for the whole stay" },
    walk: { type: ["integer", "null"], description: "Maximum walk from parking to restaurant in metres; 'short walk' ≈ 300, 'don't mind walking' ≈ 1000" },
    pref: { type: ["string", "null"], enum: ["free", "paid", "both", null], description: "Parking preference if stated" },
  },
} as const;

const SYSTEM =
  "You convert a diner's trip request in Delhi into search filters for a parking-and-restaurant planner. " +
  "Return only what the user stated or clearly implied; use null for anything not mentioned. Never invent a place.";

export async function parseTrip(text: string): Promise<ParsedTrip> {
  const q = text.trim().slice(0, 400);
  const key = typeof process !== "undefined" ? process.env["ANTHROPIC_API_KEY"] : undefined;
  if (!key) return { ...parseTripRules(q), source: "rules", note: "AI not configured — basic parser used" };
  try {
    const client = new Anthropic({ apiKey: key, timeout: 20_000, maxRetries: 1 });
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content: q }],
    });
    if (res.stop_reason === "refusal") throw new Error("refused");
    const textBlock = res.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("no text");
    const j = JSON.parse(textBlock.text) as TripIntent;
    return { ...j, source: "claude", note: null };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) console.error("AI key rejected");
    else if (e instanceof Anthropic.RateLimitError) console.error("AI rate limited");
    else console.error("AI parse failed", e instanceof Error ? e.message : e);
    return { ...parseTripRules(q), source: "rules", note: "AI unavailable — basic parser used" };
  }
}
