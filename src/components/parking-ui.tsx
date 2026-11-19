import { Check, HelpCircle, Minus } from "lucide-react";
import { KIND_LABEL, type Availability } from "@/lib/availability";
import { TAG_LABEL, type OptionTag } from "@/lib/engine";
import type { Parking, ParkingCategory } from "@/lib/places/types";
import { PREF_OPTIONS } from "@/lib/search";
import { cn } from "@/lib/utils";

const CATEGORY: Record<ParkingCategory, { text: string; cls: string; title: string }> = {
  free: { text: "FREE", cls: "bg-ok text-ink-foreground", title: "Public parking recorded as free (fee=no)" },
  paid: { text: "PAID", cls: "bg-ink text-ink-foreground", title: "Public parking recorded as paid (fee=yes)" },
  shared: { text: "SHARED", cls: "bg-primary text-primary-foreground", title: "Private parking offered with the owner's explicit permission" },
  "fee-unknown": { text: "FEE UNKNOWN", cls: "bg-muted text-foreground border border-border", title: "Public parking; whether it charges a fee is not recorded" },
};

export function CategoryBadge({ category, className }: { category: ParkingCategory; className?: string | undefined }) {
  const c = CATEGORY[category];
  return (
    <span title={c.title} className={cn("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider", c.cls, className)}>
      {c.text}
    </span>
  );
}

const LEVEL_CLASS = {
  low: "bg-ok/15 text-ok border-ok/30",
  moderate: "bg-warn/20 text-signal-foreground border-warn/40",
  high: "bg-busy/10 text-busy border-busy/30",
  "very-high": "bg-busy/15 text-busy border-busy/40",
} as const;

/** Availability with its evidence type always visible: LIVE / IMAGE ESTIMATE / PREDICTED / UNKNOWN. */
export function AvailabilityTag({ a, className }: { a: Availability; className?: string | undefined }) {
  return (
    <span
      title={`${a.source}${a.simulated ? " — demonstration data, not measured" : ""}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold",
        a.level ? LEVEL_CLASS[a.level] : "border-border bg-muted text-muted-foreground",
        className,
      )}
    >
      <span className="text-[9px] font-bold tracking-wider opacity-70">{KIND_LABEL[a.kind]}</span>
      {a.kind !== "unknown" && a.label}
      {a.simulated && <span className="font-normal opacity-70">· simulated</span>}
    </span>
  );
}

export function OptionTags({ tags }: { tags: OptionTag[] }) {
  if (!tags.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span key={t} className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold", t === "best-match" ? "bg-gradient-signal text-signal-foreground" : "bg-accent text-accent-foreground")}>
          {TAG_LABEL[t]}
        </span>
      ))}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: boolean | null }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium", value === true ? "bg-ok/10 text-ok" : "bg-muted text-muted-foreground")}>
      {value === true ? <Check className="h-2.5 w-2.5" /> : value === false ? <Minus className="h-2.5 w-2.5" /> : <HelpCircle className="h-2.5 w-2.5" />}
      {label}: {value === true ? "yes" : value === false ? "no" : "unknown"}
    </span>
  );
}

/** Only facts recorded in the data source; everything else reads "unknown". */
export function FacilityFacts({ p, className }: { p: Parking; className?: string | undefined }) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      <Fact label="Lighting" value={p.facts.lit} />
      <Fact label="Attendant" value={p.facts.supervised} />
      <Fact label="CCTV" value={p.facts.surveillance} />
      <Fact label="Covered" value={p.facts.covered} />
    </div>
  );
}

export function parkingName(p: Pick<Parking, "name" | "kind">) {
  if (p.name) return p.name;
  return p.kind === "multi-storey" ? "Multi-level car park (unnamed)" : p.kind === "underground" ? "Underground car park (unnamed)" : "Car park (unnamed)";
}

export function Stat({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub?: string | undefined }) {
  return (
    <div className="rounded-xl bg-muted/70 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="mt-1 font-display text-lg font-bold leading-tight">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function PrefToggle({ value, onChange, className }: { value: string; onChange: (v: string) => void; className?: string | undefined }) {
  return (
    <div role="radiogroup" aria-label="Parking preference" className={cn("grid grid-cols-3 gap-1 rounded-lg bg-muted p-1", className)}>
      {PREF_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.hint}
          onClick={() => onChange(o.value)}
          className={cn("rounded-md px-2 py-1.5 text-xs font-semibold transition", value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
