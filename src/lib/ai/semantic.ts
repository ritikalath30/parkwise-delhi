// On-device AI (browser): a small transformer (all-MiniLM-L6-v2, quantised, bundled in /public/models)
// embeds each clause of the user's sentence and matches its MEANING against example intents.
// Free, private, no API key. Exact numbers stay with the rules parser; this fills what was implied.
import type { TripIntent } from "./rules";

type Slot = "pref" | "walk" | "hours";
type Proto = { slot: Slot; value: string | number; label: string; examples: string[] };

const PROTOS: Proto[] = [
  { slot: "pref", value: "free", label: "free parking only", examples: ["free parking only", "I don't want to pay for parking", "no parking fees please", "I'm on a tight budget"] },
  { slot: "pref", value: "paid", label: "paid parking is fine", examples: ["paid parking is fine", "I'm happy to pay for parking", "convenience matters more than cost", "I don't mind paying"] },
  { slot: "walk", value: 250, label: "short walk", examples: ["I don't want to walk much", "short walk please", "I'm with my elderly parents", "I'm with small kids", "it might rain", "I have a bad knee"] },
  { slot: "walk", value: 1000, label: "longer walk is fine", examples: ["I don't mind walking", "happy to walk a bit", "a long walk is fine", "walking is no problem"] },
  { slot: "hours", value: 1, label: "about 1 hour", examples: ["a quick coffee", "grab a quick bite", "just a short visit", "quick lunch"] },
  { slot: "hours", value: 3, label: "about 3 hours", examples: ["a long dinner", "birthday celebration", "family get-together", "a party with friends"] },
];
const THRESHOLD = 0.5;

export type SemanticMatch = { slot: Slot; value: string | number; label: string; phrase: string; score: number };

type Extractor = (texts: string[], opts: { pooling: "mean"; normalize: boolean }) => Promise<{ tolist: () => number[][] }>;
let extractorP: Promise<Extractor> | null = null;
let protoVecs: { proto: Proto; vecs: number[][] }[] | null = null;

async function getExtractor(): Promise<Extractor> {
  extractorP ??= (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowLocalModels = true; // model files are served from this site (/public/models)
    env.allowRemoteModels = false;
    env.localModelPath = "/models/";
    if (env.backends.onnx.wasm) env.backends.onnx.wasm.wasmPaths = "/ort/";
    return (await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8" })) as unknown as Extractor;
  })();
  return extractorP;
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

export function splitClauses(text: string): string[] {
  return text
    .split(/[,;.!]|\band\b|\bbut\b|\bwith\b|\bbecause\b|\bas\b/i)
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 2);
}

/** Meaning-based matches for slots the user implied but didn't state as numbers. */
export async function understandIntent(text: string): Promise<SemanticMatch[]> {
  const clauses = splitClauses(text);
  if (!clauses.length) return [];
  const ex = await getExtractor();
  if (!protoVecs) {
    protoVecs = [];
    for (const proto of PROTOS) protoVecs.push({ proto, vecs: (await ex(proto.examples, { pooling: "mean", normalize: true })).tolist() });
  }
  const cvecs = (await ex(clauses, { pooling: "mean", normalize: true })).tolist();
  const best = new Map<Slot, SemanticMatch>();
  cvecs.forEach((cv, i) => {
    for (const { proto, vecs } of protoVecs!) {
      const score = Math.max(...vecs.map((v) => dot(cv, v)));
      const cur = best.get(proto.slot);
      if (score >= THRESHOLD && (!cur || score > cur.score)) best.set(proto.slot, { slot: proto.slot, value: proto.value, label: proto.label, phrase: clauses[i]!, score: Math.round(score * 100) / 100 });
    }
  });
  return [...best.values()];
}

/** Rules give explicit numbers; on-device AI fills only what is still unknown. */
export function mergeIntent(rules: TripIntent, matches: SemanticMatch[]): TripIntent {
  const out = { ...rules };
  for (const m of matches) {
    if (m.slot === "pref" && !out.pref) out.pref = m.value as TripIntent["pref"];
    if (m.slot === "walk" && !out.walk) out.walk = m.value as number;
    if (m.slot === "hours" && !out.hours) out.hours = m.value as number;
  }
  return out;
}
