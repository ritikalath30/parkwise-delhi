import { createFileRoute, Link } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BrainCircuit, Car, Footprints, IndianRupee, Lightbulb, Map as MapIcon, RefreshCw, ShieldCheck, Star, Timer } from "lucide-react";
import { AppShell, SimulatedNotice } from "@/components/AppShell";
import { AvailabilityBadge, CriteriaBar, ScoreRing, Stat } from "@/components/parking-ui";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { topRecommendations, WEIGHTS } from "@/lib/engine";
import { explainRecommendations } from "@/lib/recommend.functions";
import { cleanSearch, criteriaSearchSchema, toCriteria } from "@/lib/search";
import { PRICE_LABEL } from "@/lib/ui-helpers";

export const Route = createFileRoute("/recommendations")({
  validateSearch: zodValidator(criteriaSearchSchema),
  head: () => ({
    meta: [
      { title: "AI restaurant picks — ParkWise GeoAI" },
      { name: "description", content: "Top three restaurants ranked by simulated parking availability, parking charges, walking distance and expected search time, explained by AI." },
      { property: "og:title", content: "AI-ranked restaurants with easy parking — ParkWise GeoAI" },
      { property: "og:description", content: "Three restaurant picks with authorised parking, explained by AI." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RecommendationsScreen,
});

const FACTORS = [
  { key: "availability", label: "Availability", w: WEIGHTS.availability },
  { key: "cost", label: "Cost", w: WEIGHTS.cost },
  { key: "walk", label: "Walk", w: WEIGHTS.walk },
  { key: "search", label: "Search time", w: WEIGHTS.search },
] as const;

function RecommendationsScreen() {
  const search = cleanSearch(Route.useSearch());
  const c = toCriteria(search);
  const rec = topRecommendations(c, 3);
  const explain = useServerFn(explainRecommendations);

  const ai = useQuery({
    queryKey: ["explain", search],
    queryFn: () => explain({ data: search }),
    enabled: rec.top.length > 0,
    staleTime: Infinity,
    retry: false,
  });

  const excluded = rec.restaurants.filter((r) => !r.eligible);

  return (
    <AppShell search={search}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <BrainCircuit className="h-4 w-4" /> AI recommendations
            </span>
            <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Top picks in {rec.area.name}</h1>
          </div>
          <Button asChild variant="outline">
            <Link to="/map" search={search}><MapIcon /> Back to map</Link>
          </Button>
        </div>
        <div className="mt-3"><CriteriaBar search={search} /></div>

        {rec.top.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <Car className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-bold">No restaurant fits these limits</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              None of the authorised parking facilities are open, within your walking distance and within your budget at this time. Try a higher budget or a longer walk.
            </p>
            <Button asChild className="mt-4"><Link to="/" search={search}>Adjust search</Link></Button>
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-2xl border border-primary/20 bg-accent/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-primary text-primary-foreground"><BrainCircuit className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-accent-foreground">ParkWise AI summary</div>
                    {ai.isLoading ? (
                      <div className="mt-2 space-y-2"><Skeleton className="h-4 w-80 max-w-full" /><Skeleton className="h-4 w-60 max-w-full" /></div>
                    ) : ai.isError ? (
                      <p className="mt-1 text-sm">The AI explanation could not load. Rankings below are still accurate.</p>
                    ) : (
                      <p className="mt-1 text-sm">{ai.data?.summary}</p>
                    )}
                    {ai.data?.note && <p className="mt-1 text-xs text-muted-foreground">{ai.data.note}</p>}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => ai.refetch()} disabled={ai.isFetching} aria-label="Regenerate explanation">
                  <RefreshCw className={ai.isFetching ? "animate-spin" : ""} />
                  <span className="hidden sm:inline">Regenerate</span>
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {rec.top.map((r, i) => {
                const o = r.best!;
                const exp = ai.data?.picks.find((p) => p.id === r.restaurant.id);
                return (
                  <article key={r.restaurant.id} className="flex flex-col rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className={i === 0 ? "rounded-full bg-gradient-signal px-2 py-0.5 text-[11px] font-bold text-signal-foreground" : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-bold text-muted-foreground"}>
                          #{i + 1} {i === 0 ? "Best match" : "Pick"}
                        </span>
                        <h2 className="mt-2 text-xl font-bold leading-tight">{r.restaurant.name}</h2>
                        <p className="text-xs text-muted-foreground">
                          {r.restaurant.cuisine} · {PRICE_LABEL[r.restaurant.price]} · <Star className="inline h-3 w-3 fill-signal text-signal" /> {r.restaurant.rating}
                        </p>
                      </div>
                      <ScoreRing score={o.score} />
                    </div>

                    <div className="mt-4 flex items-center gap-2 rounded-xl border border-border p-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink font-display font-extrabold text-ink-foreground">P</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold">{o.park.parking.name}</div>
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><ShieldCheck className="h-3 w-3 text-ok" /> Authorised · {o.park.parking.operator}</div>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Stat icon={Car} label="Availability" value={`${o.park.availabilityPct}%`} sub={`~${o.park.freeSpots} spots · simulated`} />
                      <Stat icon={IndianRupee} label="Parking cost" value={`₹${o.park.cost}`} sub={`for ${c.hours} h`} />
                      <Stat icon={Footprints} label="Walk" value={`${o.walkM} m`} sub={`~${o.walkMin} min`} />
                      <Stat icon={Timer} label="Search time" value={`~${o.park.searchMin} min`} sub="to find a spot" />
                    </div>

                    <div className="mt-4 space-y-1.5">
                      {FACTORS.map((f) => (
                        <div key={f.key} className="flex items-center gap-2 text-[11px]">
                          <span className="w-20 text-muted-foreground">{f.label}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${Math.round(o.breakdown[f.key] * 100)}%` }} />
                          </div>
                          <span className="w-8 text-right text-muted-foreground">{Math.round(f.w * 100)}%</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex-1 rounded-xl bg-muted/60 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary"><BrainCircuit className="h-3.5 w-3.5" /> Why we recommend it</div>
                      {ai.isLoading ? (
                        <div className="mt-2 space-y-1.5"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-11/12" /><Skeleton className="h-3 w-2/3" /></div>
                      ) : exp ? (
                        <>
                          <p className="mt-1 text-sm font-semibold">{exp.headline}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{exp.reasoning}</p>
                          <p className="mt-2 flex gap-1.5 text-xs"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />{exp.tip}</p>
                        </>
                      ) : (
                        <p className="mt-1 text-sm text-muted-foreground">
                          {o.park.availabilityPct}% simulated availability, ₹{o.park.cost} parking and a {o.walkM} m walk — all within your limits.
                        </p>
                      )}
                    </div>

                    <Button asChild variant={i === 0 ? "signal" : "default"} className="mt-4 w-full">
                      <Link to="/plan" search={{ ...search, restaurant: r.restaurant.id, parking: o.park.parking.id }}>
                        Choose this restaurant <ArrowRight />
                      </Link>
                    </Button>
                  </article>
                );
              })}
            </div>
          </>
        )}

        {excluded.length > 0 && (
          <details className="mt-6 rounded-2xl border border-border bg-card p-4">
            <summary className="cursor-pointer text-sm font-semibold">Why other restaurants weren't picked ({excluded.length})</summary>
            <ul className="mt-3 space-y-2 text-sm">
              {excluded.map((r) => {
                const closest = [...r.options].sort((a, b) => a.walkM - b.walkM)[0];
                return (
                  <li key={r.restaurant.id} className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium">{r.restaurant.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {closest ? `Nearest: ${closest.park.parking.name} — ${closest.issues.join("; ")}` : "No authorised parking nearby"}
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        )}

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          <SimulatedNotice />
          <div className="flex items-start gap-2 rounded-xl border border-ok/30 bg-ok/10 px-3 py-2 text-xs">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ok" />
            <p>Only authorised, verified parking facilities are considered.{rec.excludedUnverified > 0 && ` ${rec.excludedUnverified} unverified roadside spot was excluded.`}</p>
          </div>
        </div>
        {rec.top.length > 0 && <AvailabilityLegend />}
      </div>
    </AppShell>
  );
}

function AvailabilityLegend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      Scale: <AvailabilityBadge status="good" /> <AvailabilityBadge status="limited" /> <AvailabilityBadge status="scarce" />
    </div>
  );
}
