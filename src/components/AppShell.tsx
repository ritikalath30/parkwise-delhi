import { Link, useRouterState } from "@tanstack/react-router";
import { Car, FlaskConical, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { CriteriaSearch } from "@/lib/search";
import { cn } from "@/lib/utils";

const STEPS = [
  { to: "/", label: "Search", n: 1 },
  { to: "/map", label: "Map", n: 2 },
  { to: "/recommendations", label: "AI picks", n: 3 },
  { to: "/plan", label: "Plan", n: 4 },
] as const;

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-signal text-signal-foreground shadow-[var(--shadow-card)]">
        <span className="font-display text-lg font-extrabold leading-none">P</span>
      </span>
      <span className={cn("font-display text-lg font-bold leading-none tracking-tight", light ? "text-ink-foreground" : "text-foreground")}>
        ParkWise <span className={light ? "text-signal" : "text-primary"}>GeoAI</span>
      </span>
    </span>
  );
}

export function SimulatedNotice({ className }: { className?: string | undefined }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-xl border border-signal/50 bg-signal/15 px-3 py-2 text-xs text-signal-foreground", className)}>
      <FlaskConical className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <p>
        <strong>Prototype:</strong> parking availability is <strong>simulated</strong> from typical demand patterns — it is not live data. Restaurants and tariffs are sample data.
      </p>
    </div>
  );
}

export function StepNav({ search }: { search: CriteriaSearch }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav aria-label="Journey steps" className="flex items-center gap-1 overflow-x-auto">
      {STEPS.map((s) => {
        const active = path === s.to;
        return (
          <Link
            key={s.to}
            to={s.to}
            search={search}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <span className={cn("grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold", active ? "bg-primary-foreground/20" : "bg-muted")}>
              {s.n}
            </span>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ search, children }: { search: CriteriaSearch; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-[1100] border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <Link to="/" search={search} aria-label="ParkWise GeoAI home">
            <Logo />
          </Link>
          <StepNav search={search} />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-ink text-ink-foreground">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-6 text-sm md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <Car className="h-4 w-4 text-signal" />
          <span>ParkWise GeoAI — prototype for Delhi's busiest dining districts.</span>
        </div>
        <div className="flex items-center gap-2 text-ink-foreground/70">
          <ShieldCheck className="h-4 w-4 text-ok" />
          Only authorised, verified parking is ever recommended. Availability is simulated.
        </div>
      </div>
    </footer>
  );
}
