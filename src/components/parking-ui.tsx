import { Link } from "@tanstack/react-router";
import { CalendarDays, Check, Clock, Footprints, IndianRupee, MapPin, Minus, Pencil, Shield, ShieldCheck, Tag, Timer } from "lucide-react";
import { SAFETY_BAND_LABEL, type SafetyEval } from "@/lib/safety";
import { getArea } from "@/lib/data";
import { formatTime, statusLabel, toCriteriaSafe, type ParkingStatus } from "@/lib/ui-helpers";
import { PREF_OPTIONS, type CriteriaSearch } from "@/lib/search";
import { cn } from "@/lib/utils";

const STATUS_CLASS: Record<ParkingStatus, string> = {
  good: "bg-ok/15 text-ok border-ok/30",
  limited: "bg-warn/20 text-signal-foreground border-warn/40",
  scarce: "bg-busy/15 text-busy border-busy/30",
  closed: "bg-muted text-muted-foreground border-border",
};

const DOT_CLASS: Record<ParkingStatus, string> = {
  good: "bg-ok",
  limited: "bg-warn",
  scarce: "bg-busy",
  closed: "bg-muted-foreground",
};

export function AvailabilityBadge({ status, pct, className }: { status: ParkingStatus; pct?: number | undefined; className?: string | undefined }) {
  return (
    <span title="Simulated estimate, not live data" className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold", STATUS_CLASS[status], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASS[status])} />
      {status === "closed" ? "Closed" : pct !== undefined ? `${pct}% free` : statusLabel(status)}
      {status !== "closed" && pct !== undefined && <span className="font-normal opacity-70">· sim.</span>}
      <span className="sr-only"> (simulated, not live)</span>
    </span>
  );
}

export function CriteriaBar({ search }: { search: CriteriaSearch }) {
  const c = toCriteriaSafe(search);
  const area = getArea(c.area);
  const chips = [
    { icon: MapPin, text: area.name },
    { icon: Clock, text: formatTime(c.arrival) },
    { icon: CalendarDays, text: c.day === "weekend" ? "Weekend" : "Weekday" },
    { icon: Timer, text: `${c.hours} h stay` },
    { icon: IndianRupee, text: `≤ ₹${c.budget}` },
    { icon: Footprints, text: `≤ ${c.walk} m` },
    { icon: Tag, text: PREF_OPTIONS.find((o) => o.value === c.pref)!.short },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((ch) => (
        <span key={ch.text} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs font-medium">
          <ch.icon className="h-3.5 w-3.5 text-primary" />
          {ch.text}
        </span>
      ))}
      <Link to="/" search={search} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-primary hover:bg-accent">
        <Pencil className="h-3 w-3" /> Edit search
      </Link>
    </div>
  );
}

export function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} aria-label={`Score ${score} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} className="fill-none stroke-muted" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={6} strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={circ * (1 - score / 100)} className="fill-none stroke-primary transition-all" />
      </svg>
      <span className="absolute font-display text-base font-extrabold">{score}</span>
    </div>
  );
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

export function AccessBadge({ access, className }: { access: "free" | "paid" | "shared"; className?: string | undefined }) {
  const map = {
    free: { text: "FREE", cls: "bg-ok text-ink-foreground" },
    paid: { text: "PAID", cls: "bg-ink text-ink-foreground" },
    shared: { text: "SHARED", cls: "bg-primary text-primary-foreground" },
  } as const;
  return <span className={cn("inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-extrabold tracking-wider", map[access].cls, className)}>{map[access].text}</span>;
}

export function AuthStatus({ authorisation, operator, className }: { authorisation: string; operator: string; className?: string | undefined }) {
  const shared = authorisation === "shared-permission";
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold text-ok", className)}>
      <ShieldCheck className="h-3 w-3 shrink-0" />
      {shared ? "Owner permission verified" : "Verified authorised"} · {operator}
    </span>
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
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-md px-2 py-1.5 text-xs font-semibold transition",
            value === o.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const SAFETY_CLASS = {
  high: "bg-ok/15 text-ok border-ok/30",
  moderate: "bg-warn/20 text-signal-foreground border-warn/40",
  limited: "bg-busy/15 text-busy border-busy/30",
} as const;

/** Parking Safety Score chip. Indicators are synthetic — never a claim that a facility is safe. */
export function SafetyBadge({ safety, className, long = false }: { safety: SafetyEval; className?: string | undefined; long?: boolean }) {
  return (
    <span
      title={`${SAFETY_BAND_LABEL[safety.band]} · synthetic prototype indicators, not a safety guarantee`}
      className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold", SAFETY_CLASS[safety.band], className)}
    >
      <Shield className="h-3 w-3" />
      {long ? `${SAFETY_BAND_LABEL[safety.band]} · ${safety.score}` : `Safety ${safety.score}`}
    </span>
  );
}

export function SafetyAttributes({ safety, className }: { safety: SafetyEval; className?: string | undefined }) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {safety.attributes.map((a) => (
        <span key={a.label} className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium", a.ok ? "bg-ok/10 text-ok" : "bg-muted text-muted-foreground")}>
          {a.ok ? <Check className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
          {a.label}
        </span>
      ))}
    </div>
  );
}
