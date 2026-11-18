import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { zodValidator } from "@tanstack/zod-adapter";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, BrainCircuit, Medal, Loader2, Car, Footprints, IndianRupee, Lightbulb, Map as MapIcon, RefreshCw, ShieldCheck, Star, Timer } from "lucide-react";
import { AppShell, SimulatedNotice } from "@/components/AppShell";
import { AccessBadge, AuthStatus, AvailabilityBadge, CriteriaBar, ScoreRing, Stat } from "@/components/parking-ui";
import { Button } from "@/components/ui/button";
import { TripAdjuster } from "@/components/TripAdjuster";
import { topRecommendations } from "@/lib/engine";
import { ruleBasedExplanation } from "@/lib/explain";
import { explainRecommendations } from "@/lib/recommend.functions";
import { cleanSearch, criteriaSearchSchema, suggestFixes, toCriteria } from "@/lib/search";
import { chargesText, PRICE_LABEL } from "@/lib/ui-helpers";

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
  { key: "availability", label: "Availability" },
  { key: "cost", label: "Cost" },
  { key: "walk", label: "Walk" },
  { key: "search", label: "Search time" },
  { key: "authorisation", label: "Authorisation" },
] as const;

function RecommendationsScreen() {
  const search = cleanSearch(Route.useSearch());
  const navigate = useNavigate({ from: "/recommendations" });
  const c = toCriteria(search);
  const rec = topRecommendations(c, 3);
  const rules = ruleBasedExplanation(c);
  const fixes = rec.top.length === 0 ? suggestFixes(search) : [];
  const explain = useServerFn(explainRecommendations);

  // Wait for the user to stop adjusting before asking the AI again.
  const searchKey = JSON.stringify(search);
  const [aiKey, setAiKey] = useState(searchKey);
  useEffect(() => {
    const t = setTimeout(() => setAiKey(searchKey), 700);
    return () => clearTimeout(t);
  }, [searchKey]);

  const ai = useQuery({
    queryKey: ["explain", aiKey],
    queryFn: () => explain({ data: JSON.parse(aiKey) }),
    enabled: rec.top.length > 0,
    staleTime: Infinity,
    retry: false,
  });
  const aiFresh = aiKey === searchKey && !!ai.data;
  const aiWorking = rec.top.length > 0 && (ai.isFetching || aiKey !== searchKey);
  const explanation = aiFresh && ai.data ? ai.data : null;
  const summary = explanation?.summary ?? rules.summary;

  const update = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => cleanSearch({ ...prev, ...patch }), replace: true, resetScroll: false });

  const topIds = new Set(rec.top.map((r) => r.restaurant.id));
  const thirdScore = rec.top[rec.top.length - 1]?.best?.score ?? 0;
  const excluded = rec.restaurants
    .filter((r) => !topIds.has(r.restaurant.id))
    .sort((a, b) => (b.best?.score ?? -1) - (a.best?.score ?? -1));

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
        <div className="mt-4"><TripAdjuster search={search} onChange={update} /></div>

        {rec.top.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <Car className="mx-auto h-8 w-8 text-muted-foreground" />
            <h2 className="mt-3 text-lg font-bold">No restaurant fits these limits</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {rules.summary}
            </p>
            {fixes.length > 0 ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {fixes.map((f) => (
                  <Button key={f.label} size="sm" onClick={() => update(f.patch)}>
                    {f.label} <span className="font-normal opacity-80">· {f.results} fit</span>
                  </Button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">No single change makes a restaurant fit — try a different area or time.</p>
            )}
            <Button asChild variant="outline" size="sm" className="mt-3"><Link to="/" search={search}>Adjust search</Link></Button>
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-2xl border border-primary/20 bg-accent/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-primary text-primary-foreground"><BrainCircuit className="h-5 w-5" /></span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-accent-foreground">
                      ParkWise AI summary
                      {aiWorking ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-card px-2 py-0.5 font-medium text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> AI is writing a fresh explanation…</span>
                      ) : explanation?.source === "ai" ? (
                        <span className="rounded-full bg-card px-2 py-0.5 font-medium text-muted-foreground">Written by AI from the numbers below</span>
                      ) : (
                        <span className="rounded-full bg-card px-2 py-0.5 font-medium text-muted-foreground">Rule-based</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm">{summary}</p>
                    {ai.isError && !aiWorking && <p className="mt-1 text-xs text-muted-foreground">The AI explanation couldn't load — showing rule-based reasoning. Try Regenerate.</p>}
                    {explanation?.note && <p className="mt-1 text-xs text-muted-foreground">{explanation.note}</p>}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => ai.refetch()} disabled={aiWorking} aria-label="Regenerate explanation">
                  <RefreshCw className={aiWorking ? "animate-spin" : ""} />
                  <span className="hidden sm:inline">Regenerate</span>
                </Button>
              </div>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {rec.top.map((r, i) => {
                const o = r.best!;
                const exp = explanation?.picks.find((p) => p.id === r.restaurant.id) ?? rules.picks.find((p) => p.id === r.restaurant.id);
                const rankReason = rules.picks[i]?.rankReason;
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
                        <div className="mt-0.5 flex flex-wrap items-center gap-1.5"><AccessBadge access={o.park.parking.access} /><AuthStatus authorisation={o.park.parking.authorisation} operator={o.park.parking.operator} /></div>
                      </div>
                    </div>

                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Charges: {o.park.parking.access === "free" ? "free (₹0)" : `${chargesText(o.park.parking)} · illustrative`}
                    </p>

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Stat icon={Car} label="Availability" value={`${o.park.availabilityPct}%`} sub={`~${o.park.freeSpots} spots · simulated`} />
                      <Stat icon={IndianRupee} label="Parking cost" value={o.park.cost === 0 ? "FREE" : `₹${o.park.cost}`} sub={o.park.cost === 0 ? "₹0 · verified free" : `for ${c.hours} h · illustrative`} />
                      <Stat icon={Footprints} label="Walk (est. route)" value={`~${o.walkM} m`} sub={`${o.straightM} m straight · ~${o.walkMin} min`} />
                      <Stat icon={Timer} label="Search time" value={`~${o.park.searchMin} min`} sub="to find a spot" />
                    </div>

                    <div className="mt-4 space-y-1.5">
                      {FACTORS.map((f) => (
                        <div key={f.key} className="flex items-center gap-2 text-[11px]">
                          <span className="w-24 text-muted-foreground">{f.label}</span>
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${Math.round(o.breakdown[f.key] * 100)}%` }} />
                          </div>
                          <span className="w-8 text-right text-muted-foreground">{Math.round(o.weights[f.key] * 100)}%</span>
                        </div>
                      ))}
                    </div>

                    {rankReason && (
                      <div className="mt-4 flex gap-2 rounded-xl border border-primary/20 bg-accent/50 p-3 text-xs text-accent-foreground">
                        <Medal className="mt-0.5 h-4 w-4 shrink-0" />
                        <p><span className="font-semibold">Why #{i + 1}: </span>{rankReason}</p>
                      </div>
                    )}

                    <div className="mt-3 flex-1 rounded-xl bg-muted/60 p-3">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-primary"><BrainCircuit className="h-3.5 w-3.5" /> Why we recommend it</div>
                      {exp && (
                        <>
                          <p className="mt-1 text-sm font-semibold">{exp.headline}</p>
                          <p className="mt-1 text-sm text-muted-foreground">{exp.reasoning}</p>
                          {exp.tradeoff && <p className="mt-2 rounded-lg bg-card p-2 text-xs"><span className="font-semibold">Free vs paid: </span>{exp.tradeoff}</p>}
                          <p className="mt-2 flex gap-1.5 text-xs"><Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />{exp.tip}</p>
                        </>
                      )}
                      {aiWorking && <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Updating with AI…</p>}
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
            <summary className="cursor-pointer text-sm font-semibold">Why other restaurants aren't in the top three ({excluded.length})</summary>
            <ul className="mt-3 space-y-2 text-sm">
              {excluded.map((r) => {
                const closest = [...r.options].sort((a, b) => a.walkM - b.walkM)[0];
                return (
                  <li key={r.restaurant.id} className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="font-medium">{r.restaurant.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {r.best
                        ? `Fits your limits but scores ${r.best.score}/100 (vs ${thirdScore} for #3) with ${r.best.park.parking.name}`
                        : closest
                          ? `No parking fits — nearest: ${closest.park.parking.name}: ${closest.issues.join("; ")}`
                          : "No authorised parking nearby"}
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
            <p>Only authorised facilities and owner-permitted shared parking are considered.{rec.excludedUnverified > 0 && ` ${rec.excludedUnverified} restricted or unverified space${rec.excludedUnverified > 1 ? "s were" : " was"} excluded.`}</p>
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
