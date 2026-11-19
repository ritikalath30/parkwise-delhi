import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { CleanSearch } from "@/lib/search";

type Resp = {
  intent: { place: string | null; time: string | null; hours: number | null; budget: number | null; walk: number | null; pref: "free" | "paid" | "both" | null; source: "claude" | "rules"; note: string | null };
  destination: { label: string; lat: number; lng: number } | null;
  error?: string;
};

/** Natural-language trip input: AI turns a sentence into the destination + filters. */
export function AiTripBox({ onResult }: { onResult: (patch: Partial<CleanSearch>, go: boolean) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; source?: string } | null>(null);

  const run = async () => {
    if (text.trim().length < 3) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/ai-search?q=${encodeURIComponent(text)}`);
      const j = (await res.json()) as Resp;
      if (j.error) throw new Error(j.error);
      const i = j.intent;
      const patch: Partial<CleanSearch> = {};
      if (j.destination) Object.assign(patch, { q: j.destination.label, lat: j.destination.lat, lng: j.destination.lng });
      if (i.time) patch.time = i.time;
      if (i.hours) patch.hours = i.hours;
      if (i.budget) patch.budget = i.budget;
      if (i.walk) patch.walk = i.walk;
      if (i.pref) patch.pref = i.pref;
      const parts = [
        j.destination ? `📍 ${j.destination.label}` : i.place ? `📍 “${i.place}” not found in Delhi` : "📍 no place found — add one",
        i.time && `🕗 ${i.time}`,
        i.hours && `${i.hours} h`,
        i.pref && (i.pref === "free" ? "free parking" : i.pref === "paid" ? "paid parking" : "free or paid"),
        i.budget && `≤ ₹${i.budget}`,
        i.walk && `walk ≤ ${i.walk} m`,
      ].filter(Boolean);
      setMsg({ ok: !!j.destination, text: parts.join(" · "), source: i.source === "claude" ? "Understood by Claude AI" : (i.note ?? "Basic parser") });
      onResult(patch, !!j.destination);
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
        placeholder="e.g. Dinner near Connaught Place at 8 for 2 hours, paid parking is fine, short walk"
        className="w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button type="button" onClick={run} disabled={busy || text.trim().length < 3} className="w-full">
        {busy ? <Loader2 className="animate-spin" /> : <Sparkles />} {busy ? "Understanding your plan…" : "Plan it with AI"}
      </Button>
      {msg && (
        <p className={msg.ok ? "text-xs text-foreground" : "text-xs text-busy"} data-testid="ai-result">
          {msg.text}
          {msg.source && <span className="block text-[11px] text-muted-foreground">{msg.source}</span>}
        </p>
      )}
    </div>
  );
}
