import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CleanSearch } from "@/lib/search";
import { mergeIntent, understandIntent, type SemanticMatch } from "@/lib/ai/semantic";

type Resp = {
  intent: { place: string | null; time: string | null; hours: number | null; budget: number | null; walk: number | null; pref: "free" | "paid" | "both" | null; source: "claude" | "rules"; note: string | null };
  destination: { label: string; lat: number; lng: number } | null;
  error?: string;
};

/** Natural-language trip input: AI turns a sentence into the destination + filters. */
export function AiTripBox({ onResult, onGo, date, time }: { onResult: (patch: Partial<CleanSearch>, go: boolean) => void; onGo: () => void; date: string; time: string }) {
  const [askTime, setAskTime] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; source?: string; why?: SemanticMatch[] } | null>(null);
  const [stage, setStage] = useState("");
  const [ready, setReady] = useState(false);

  const run = async () => {
    if (text.trim().length < 3) return;
    setBusy(true);
    setMsg(null);
    try {
      setStage("Reading your plan…");
      const res = await fetch(`/api/ai-search?q=${encodeURIComponent(text)}`);
      const j = (await res.json()) as Resp;
      if (j.error) throw new Error(j.error);
      let i = j.intent;
      let why: SemanticMatch[] = [];
      let source = i.source === "claude" ? "Understood by Claude AI" : "";
      if (i.source !== "claude") {
        // Free on-device AI: understands implied meaning ("with my elderly parents" → short walk)
        try {
          setStage("Running on-device AI (first time loads the model)…");
          why = await understandIntent(text);
          i = { ...i, ...mergeIntent(i, why) };
          source = "Understood by on-device AI (MiniLM transformer) + rules";
        } catch (err) {
          console.error("On-device AI failed", err);
          source = "Basic parser (on-device AI couldn't load)";
        }
      }
      const patch: Partial<CleanSearch> = {};
      if (j.destination) Object.assign(patch, { q: j.destination.label, lat: j.destination.lat, lng: j.destination.lng });
      if (i.time) patch.time = i.time;
      if (i.hours) patch.hours = i.hours;
      if (i.budget) patch.budget = i.budget;
      if (i.walk) patch.walk = i.walk;
      if (i.pref) patch.pref = i.pref;
      const explicitTime = /\d/.test(text) && i.time;
      const parts = [
        j.destination ? `📍 ${j.destination.label}` : i.place ? `📍 couldn’t find “${i.place}”. Add the area or city (e.g. “Bandra, Mumbai”)` : "📍 Where are you going? Add a place, e.g. “dinner at Cyber Hub, Gurugram”",
        i.time ? `🕗 ${i.time}${explicitTime ? "" : " (from “" + (/dinner/i.test(text) ? "dinner" : /lunch/i.test(text) ? "lunch" : "breakfast") + "”)"}` : "🕗 time not mentioned → 7:30 pm",

        i.hours && `${i.hours} h`,
        i.pref && (i.pref === "free" ? "free parking" : i.pref === "paid" ? "paid parking" : "free or paid"),
        i.budget && `≤ ₹${i.budget}`,
        i.walk && `walk ≤ ${i.walk} m`,
      ].filter(Boolean);
      setMsg({ ok: !!j.destination, text: parts.join(" · "), source, why });
      onResult(patch, false);
      setReady(!!j.destination);
      setAskTime(!explicitTime);
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Couldn't understand that — try the form below." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border-2 border-primary/30 bg-accent/40 p-3" data-testid="ai-box">
      <label htmlFor="ai-trip" className="flex items-center gap-1.5 text-sm font-bold">
        <Sparkles className="h-4 w-4 text-primary" /> Describe your plan <span className="font-normal text-muted-foreground">— AI fills in everything</span>
      </label>
      <textarea
        id="ai-trip"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void run();
          }
        }}
        placeholder="e.g. Birthday dinner near Connaught Place at 8, happy to pay for parking, with my elderly parents"
        className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button type="button" onClick={run} disabled={busy || text.trim().length < 3} className="w-full">
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? stage || "Understanding your plan…" : "Plan it with AI"}
      </Button>
      {msg && (
        <p className={msg.ok ? "text-xs text-foreground" : "text-xs text-busy"} data-testid="ai-result">
          {msg.text}
          {msg.source && <span className="block text-[11px] text-muted-foreground">{msg.source}</span>}
          {!!msg.why?.length && (
            <span className="mt-1 block text-[11px] text-muted-foreground" data-testid="ai-why">
              {msg.why.map((w) => `“${w.phrase}” → ${w.label} (match ${Math.round(w.score * 100)}%)`).join(" · ")}
            </span>
          )}
        </p>
      )}
      {ready && (
        <div className={askTime ? "grid grid-cols-2 gap-2 rounded-lg border-2 border-signal bg-signal/10 p-2" : "grid grid-cols-2 gap-2"} data-testid="ai-ask-time">
          {askTime && <p className="col-span-2 text-xs font-semibold">When are you going? (not mentioned)</p>}
          <input type="date" aria-label="Date" value={date || new Date().toISOString().slice(0, 10)} onChange={(e) => e.target.value && onResult({ date: e.target.value }, false)} className="h-9 rounded-md border border-input bg-card px-2 text-sm" />
          <input type="time" aria-label="Arrival time" value={time} onChange={(e) => e.target.value && onResult({ time: e.target.value }, false)} className="h-9 rounded-md border border-input bg-card px-2 text-sm" />
        </div>
      )}
      {ready && (
        <Button type="button" variant="signal" className="w-full" onClick={onGo} data-testid="ai-go">
          See restaurants &amp; parking →
        </Button>
      )}
    </div>
  );
}
