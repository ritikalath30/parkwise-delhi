import { Link } from "@tanstack/react-router";
import { CalendarDays, Clock, Footprints, IndianRupee, MapPin, Pencil, Timer } from "lucide-react";
import { getArea } from "@/lib/data";
import { formatTime, statusLabel, toCriteriaSafe, type ParkingStatus } from "@/lib/ui-helpers";
import type { CriteriaSearch } from "@/lib/search";
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
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold", STATUS_CLASS[status], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", DOT_CLASS[status])} />
      {status === "closed" ? "Closed" : pct !== undefined ? `${pct}% free` : statusLabel(status)}
      <span className="sr-only"> (simulated)</span>
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
