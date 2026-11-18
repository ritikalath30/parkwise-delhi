import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Ban, BrainCircuit, Car, Lightbulb, Loader2, Navigation, RefreshCw, Star, UtensilsCrossed, X } from "lucide-react";
import { AppShell, SimulatedNotice } from "@/components/AppShell";
import { MapView } from "@/components/MapView";
import type { MapPin } from "@/components/map-types";
import { AccessBadge, AuthStatus, AvailabilityBadge, SafetyAttributes, SafetyBadge, ScoreRing } from "@/components/parking-ui";
import { TripAdjuster } from "@/components/TripAdjuster";
import { Button } from "@/components/ui/button";
import { topRecommendations, type FactorKey, type Option, type RestaurantEval } from "@/lib/engine";
import { ruleBasedExplanation } from "@/lib/explain";
import { explainRecommendations } from "@/lib/recommend.functions";
import { getWalkingRoute, getWalkMatrix } from "@/lib/route.functions";
import { walkingRouteNote } from "@/lib/safety";
import { cleanSearch, criteriaSearchSchema, suggestFixes, toCriteria } from "@/lib/search";
import { chargesText, directionsUrl, hoursText, PRICE_LABEL } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/explore")({
  validateSearch: zodValidator(criteriaSearchSchema),
  // OSM walking distances for the whole area (one request, cached); null → estimates are used.
  loaderDeps: ({ search }) => ({ area: search.area }),
  loader: async ({ deps }) => ({ routes: await getWalkMatrix({ data: { area: deps.area } }).catch(() => null) }),
  staleTime: 10 * 60_000,
  head: () => ({
    meta: [
      { title: "Explore restaurants & parking — ParkWise GeoAI" },
      { name: "description", content: "Map, top three AI picks and authorised parking ranked by simulated availability, safety indicators, cost and walking distance." },
      { property: "og:title", content: "Explore restaurants with authorised parking — ParkWise GeoAI" },
      { property: "og:description", content: "Interactive map and AI-ranked restaurant picks with authorised parking." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ExploreScreen,
});

const FACTORS: { key: FactorKey; label: string }[] = [
  { key: "availability", label: "Availability" },
  { key: "safety", label: "Safety" },
  { key: "walk", label: "Walk" },
  { key: "cost", label: "Cost" },
  { key: "search", label: "Search time" },
  { key: "authorisation", label: "Authorisation" },
];

type View = "top" | "all" | "parking";
type SortKey = "safety" | "cost" | "availability" | "walk";

function ExploreScreen() {
  const search = cleanSearch(Route.useSearch());
  const { routes } = Route.useLoaderData();
  const navigate = useNavigate({ from: "/explore" });
  const c = toCriteria(search);
  const searchKey = JSON.stringify(search);
  const rec = useMemo(() => topRecommendations(c, 3, routes), [searchKey, routes]); // eslint-disable-line react-hooks/exhaustive-deps
  const rules = useMemo(() => ruleBasedExplanation(c, routes), [searchKey, routes]); // eslint-disable-line react-hooks/exhaustive-deps
  const fixes = useMemo(() => (rec.top.length === 0 ? suggestFixes(search) : []), [searchKey, rec.top.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (patch: Partial<typeof search>) =>
    navigate({ search: (prev) => cleanSearch({ ...prev, ...patch }), replace: true, resetScroll: false });

  // AI wording (rules are shown instantly; AI rewrites them after the user stops adjusting).
  const explain = useServerFn(explainRecommendations);
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
  const aiWorking = rec.top.length > 0 && (ai.isFetching || aiKey !== searchKey);
  const explanation = aiKey === searchKey && ai.data ? ai.data : null;
  const pickText = (id: string) => explanation?.picks.find((p) => p.id === id) ?? rules.picks.find((p) => p.id === id);

  // Selection: a restaurant (defaults to the #1 pick) and one of its eligible parking options.
  const [view, setView] = useState<View>("top");
  const [selR, setSelR] = useState<string | null>(null);
  const [selP, setSelP] = useState<string | null>(null);
  const [focusP, setFocusP] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("safety");
  const [showDine, setShowDine] = useState(true);
  const [layers, setLayers] = useState({ free: true, paid: true, shared: true, restricted: true });
  useEffect(() => {
    setSelR(null);
    setSelP(null);
    setFocusP(null);
  }, [c.area]);

  const selected = rec.restaurants.find((r) => r.restaurant.id === selR) ?? rec.top[0] ?? null;
  const option = selected ? (selected.options.find((o) => o.eligible && o.park.parking.id === selP) ?? selected.best) : null;
  const eligibleForSelected = new Set(selected?.options.filter((o) => o.eligible).map((o) => o.park.parking.id));
  const combos = rec.restaurants.reduce((n, r) => n + r.options.filter((o) => o.eligible).length, 0);
  const totalCombos = rec.restaurants.length * rec.parkings.length;
  const topIds = new Set(rec.top.map((r) => r.restaurant.id));

  const fetchRoute = useServerFn(getWalkingRoute);
  const routeQ = useQuery({
    queryKey: ["walk-route", option?.park.parking.id, selected?.restaurant.id],
    queryFn: () => fetchRoute({ data: { parkingId: option!.park.parking.id, restaurantId: selected!.restaurant.id } }),
    enabled: !!selected && !!option,
    staleTime: Infinity,
    retry: false,
  });
  const routeLine: [number, number][] | null =
    selected && option
      ? (routeQ.data?.coords ?? [
          [option.park.parking.lat, option.park.parking.lng],
          [selected.restaurant.lat, selected.restaurant.lng],
        ])
      : null;

  const selectRestaurant = (id: string) => {
    setSelR(id);
    setSelP(null);
    setFocusP(null);
    if (!topIds.has(id) && view !== "all") setView("all");
    else if (view === "parking") setView(topIds.has(id) ? "top" : "all");
    requestAnimationFrame(() => document.getElementById(`r-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const selectParking = (id: string) => {
    if (selected && eligibleForSelected.has(id)) {
      setSelP(id);
      setFocusP(null);
    } else setFocusP(id);
  };

  const focusPark = focusP ? rec.parkings.find((p) => p.parking.id === focusP) : undefined;
  const focusExcluded = focusP ? rec.excluded.find((p) => p.id === focusP) : undefined;

  const dinePins: MapPin[] = showDine
    ? rec.restaurants.map((r) => ({
        id: r.restaurant.id,
        name: r.restaurant.name,
        lat: r.restaurant.lat,
        lng: r.restaurant.lng,
        dim: !r.eligible,
      }))
    : [];
  const parkPins: MapPin[] = [
    ...rec.parkings
      .filter((p) => layers[p.parking.access])
      .map((p) => ({
        id: p.parking.id,
        name: p.parking.name,
        lat: p.parking.lat,
        lng: p.parking.lng,
        status: p.status,
        variant: p.parking.access,
        dim: !!selected && !eligibleForSelected.has(p.parking.id),
      })),
    ...(layers.restricted
      ? rec.excluded.map((p) => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, variant: "restricted" as const }))
      : []),
  ];

  const sortedParkings = [...rec.parkings].sort((a, b) => {
    const wa = selected?.options.find((o) => o.park.parking.id === a.parking.id)?.walkM ?? 0;
    const wb = selected?.options.find((o) => o.park.parking.id === b.parking.id)?.walkM ?? 0;
    return sortBy === "safety"
      ? b.safety.score - a.safety.score
      : sortBy === "cost"
        ? a.cost - b.cost
        : sortBy === "availability"
          ? b.availabilityPct - a.availabilityPct
          : wa - wb;
  });

  return (
    <AppShell search={search}>
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{rec.area.name}</h1>
            <p className="text-xs text-muted-foreground" data-testid="combo-count">
              {combos} of {totalCombos} restaurant–parking combinations pass your filters · {rec.rankedCount} of {rec.restaurants.length} restaurants
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,460px)_1fr]">
          {/* Map: first on mobile, sticky on desktop */}
          <div className="relative order-1 lg:order-2">
            <div className="lg:sticky lg:top-20">
              <MapView
                center={rec.area.center}
                zoom={rec.area.zoom}
                fitKey={rec.area.id}
                restaurants={dinePins}
                parkings={parkPins}
                selectedRestaurantId={selected?.restaurant.id ?? null}
                selectedParkingId={focusP ?? option?.park.parking.id ?? null}
                onSelectRestaurant={selectRestaurant}
                onSelectParking={selectParking}
                route={routeLine}
                showPopups={false}
                zones={layers.restricted ? rec.area.zones : []}
                walkCircle={selected ? { center: [selected.restaurant.lat, selected.restaurant.lng], radius: c.walk / 1.3 } : null}
                className="h-[42vh] w-full overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-card)] lg:h-[calc(100vh-120px)] lg:min-h-[560px]"
              />
              <div className="pointer-events-none absolute left-14 right-3 top-3 z-[500] flex justify-end">
                <div className="pointer-events-auto flex flex-wrap justify-end gap-1 rounded-xl bg-card/95 p-1 shadow-[var(--shadow-card)] backdrop-blur">
                  <LayerToggle active={showDine} onClick={() => setShowDine((v) => !v)} icon={UtensilsCrossed} label="Restaurants" tone="dine" />
                  <LayerToggle active={layers.free} onClick={() => setLayers((l) => ({ ...l, free: !l.free }))} icon={Car} label="Free" tone="ok" />
                  <LayerToggle active={layers.paid} onClick={() => setLayers((l) => ({ ...l, paid: !l.paid }))} icon={Car} label="Paid" tone="ink" />
                  <LayerToggle active={layers.shared} onClick={() => setLayers((l) => ({ ...l, shared: !l.shared }))} icon={Car} label="Shared" tone="primary" />
                  <LayerToggle active={layers.restricted} onClick={() => setLayers((l) => ({ ...l, restricted: !l.restricted }))} icon={Ban} label="Restricted" tone="busy" />
                </div>
              </div>
              <div className="absolute bottom-3 left-3 z-[500] hidden rounded-xl bg-card/95 px-3 py-2 text-[11px] shadow-[var(--shadow-card)] backdrop-blur sm:block">
                <div className="flex gap-3">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-ok" /> Good</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warn" /> Limited</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-busy" /> Nearly full</span>
                  <span className="text-muted-foreground">· simulated</span>
                </div>
              </div>
              {(focusPark || focusExcluded) && (
                <div className="relative z-[500] mt-3 rounded-2xl border border-border bg-card p-3 shadow-[var(--shadow-float)] sm:absolute sm:bottom-14 sm:right-3 sm:mt-0 sm:w-80" data-testid="parking-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-display text-sm font-bold leading-tight">{focusPark?.parking.name ?? focusExcluded!.name}</div>
                      {focusPark ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <AccessBadge access={focusPark.parking.access} />
                          <SafetyBadge safety={focusPark.safety} />
                          <AvailabilityBadge status={focusPark.status} pct={focusPark.availabilityPct} />
                        </div>
                      ) : (
                        <div className="mt-1 text-[11px] font-semibold text-busy">
                          {focusExcluded!.authorisation === "restricted" ? "Restricted — not legal parking" : "Unverified — not authorised"}
                        </div>
                      )}
                    </div>
                    <button className="rounded-md p-1 text-muted-foreground hover:bg-muted" onClick={() => setFocusP(null)} aria-label="Close details"><X className="h-4 w-4" /></button>
                  </div>
                  {focusPark ? (
                    <>
                      <p className="mt-2 text-xs">
                        {focusPark.cost === 0 ? "Free" : `₹${focusPark.cost} for ${c.hours} h`} · {chargesText(focusPark.parking)} · open {hoursText(focusPark.parking)}
                      </p>
                      {selected && (
                        <p className="mt-1 text-xs text-busy">
                          Not an option for {selected.restaurant.name}: {selected.options.find((o) => o.park.parking.id === focusPark.parking.id)?.issues.join("; ") || "—"}
                        </p>
                      )}
                      <Button asChild size="sm" variant="outline" className="mt-2 w-full">
                        <a href={directionsUrl(focusPark.parking.lat, focusPark.parking.lng)} target="_blank" rel="noopener noreferrer"><Navigation /> Directions</a>
                      </Button>
                    </>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">{focusExcluded!.note} ParkWise never recommends this space.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Recommendations panel */}
          <aside className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
            <TripAdjuster search={search} onChange={update} showArea />

            {rec.top.length > 0 && (
              <div className="rounded-2xl border border-primary/20 bg-accent/60 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p data-testid="ai-summary">{explanation?.summary ?? rules.summary}</p>
                    <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                      {aiWorking ? (
                        <><Loader2 className="h-3 w-3 animate-spin" /> AI is rewording…</>
                      ) : explanation?.source === "ai" ? (
                        `Written by AI from the ranking numbers${explanation.note ? ` · ${explanation.note}` : ""}`
                      ) : (
                        `Rule-based, from the ranking numbers${explanation?.source === "fallback" && explanation.note ? " · AI unavailable" : ""}`
                      )}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => ai.refetch()} disabled={aiWorking} aria-label="Regenerate explanation">
                    <RefreshCw className={cn("h-3.5 w-3.5", aiWorking && "animate-spin")} />
                  </Button>
                </div>
              </div>
            )}

            <div role="tablist" aria-label="Results view" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1 text-xs font-semibold">
              {([
                ["top", `Top ${Math.min(3, rec.top.length) || 3}`],
                ["all", `All restaurants (${rec.restaurants.length})`],
                ["parking", `Compare parking (${rec.parkings.length})`],
              ] as const).map(([v, label]) => (
                <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={cn("rounded-md px-2 py-1.5 transition", view === v ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}>
                  {label}
                </button>
              ))}
            </div>

            {view !== "parking" && rec.top.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center" data-testid="empty-state">
                <Car className="mx-auto h-7 w-7 text-muted-foreground" />
                <h2 className="mt-2 font-bold">No restaurant fits these filters</h2>
                <p className="mt-1 text-sm text-muted-foreground">{rules.summary}</p>
                {fixes.length > 0 && (
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {fixes.map((f) => (
                      <Button key={f.label} size="sm" onClick={() => update(f.patch)}>
                        {f.label} <span className="font-normal opacity-80">· {f.results} fit</span>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {view === "top" &&
              rec.top.map((r, i) => (
                <RestaurantCard
                  key={r.restaurant.id}
                  r={r}
                  rank={i + 1}
                  selected={selected?.restaurant.id === r.restaurant.id}
                  option={selected?.restaurant.id === r.restaurant.id ? option : r.best}
                  onSelect={() => selectRestaurant(r.restaurant.id)}
                  onPickParking={setSelP}
                  text={pickText(r.restaurant.id)}
                  aiWorking={aiWorking}
                  c={c}
                  search={search}
                />
              ))}

            {view === "all" &&
              [...rec.restaurants]
                .sort((a, b) => Number(b.eligible) - Number(a.eligible) || (b.best?.score ?? 0) - (a.best?.score ?? 0))
                .map((r) => (
                  <RestaurantCard
                    key={r.restaurant.id}
                    r={r}
                    rank={rec.top.findIndex((t) => t.restaurant.id === r.restaurant.id) + 1 || undefined}
                    selected={selected?.restaurant.id === r.restaurant.id}
                    option={selected?.restaurant.id === r.restaurant.id ? option : r.best}
                    onSelect={() => selectRestaurant(r.restaurant.id)}
                    onPickParking={setSelP}
                    text={topIds.has(r.restaurant.id) ? pickText(r.restaurant.id) : undefined}
                    aiWorking={false}
                    c={c}
                    search={search}
                  />
                ))}

            {view === "parking" && (
              <div className="rounded-2xl border border-border bg-card p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Authorised facilities{selected ? ` · walk to ${selected.restaurant.name}` : ""}
                  </p>
                  <div className="flex gap-1 text-[11px]" role="radiogroup" aria-label="Sort parking">
                    {(["safety", "cost", "availability", "walk"] as const).map((k) => (
                      <button key={k} role="radio" aria-checked={sortBy === k} onClick={() => setSortBy(k)} className={cn("rounded-md px-2 py-1 font-semibold capitalize", sortBy === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                        {k}
                      </button>
                    ))}
                  </div>
                </div>
                <ul className="mt-2 divide-y divide-border" data-testid="parking-compare">
                  {sortedParkings.map((p) => {
                    const o = selected?.options.find((x) => x.park.parking.id === p.parking.id);
                    const ok = !!o?.eligible;
                    return (
                      <li key={p.parking.id}>
                        <button
                          onClick={() => (ok ? setSelP(p.parking.id) : setFocusP(p.parking.id))}
                          className={cn("flex w-full items-center gap-2 py-2 text-left", option?.park.parking.id === p.parking.id && "font-semibold")}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm">{p.parking.name}</div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                              <AccessBadge access={p.parking.access} />
                              <span>{p.cost === 0 ? "₹0" : `₹${p.cost}`}</span>
                              <AvailabilityBadge status={p.status} pct={p.availabilityPct} />
                              {o && <span>{o.walkM} m{o.walkSource === "estimate" ? " est." : ""}</span>}
                              {!ok && o && <span className="text-busy">{o.issues[0]}</span>}
                            </div>
                          </div>
                          <SafetyBadge safety={p.safety} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {rec.excluded.length > 0 && (
                  <p className="mt-2 border-t border-border pt-2 text-[11px] text-muted-foreground">
                    <Ban className="mr-1 inline h-3 w-3 text-busy" />
                    {rec.excluded.length} restricted or unverified space{rec.excluded.length > 1 ? "s" : ""} shown on the map are never recommended, whatever their safety indicators.
                  </p>
                )}
              </div>
            )}

            <SimulatedNotice />
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function RestaurantCard({
  r,
  rank,
  selected,
  option,
  onSelect,
  onPickParking,
  text,
  aiWorking,
  c,
  search,
}: {
  r: RestaurantEval;
  rank?: number | undefined;
  selected: boolean;
  option: Option | null;
  onSelect: () => void;
  onPickParking: (id: string) => void;
  text?: { headline: string; reasoning: string; tip: string; rankReason: string; tradeoff: string } | undefined;
  aiWorking: boolean;
  c: ReturnType<typeof toCriteria>;
  search: ReturnType<typeof cleanSearch>;
}) {
  const nearest = [...r.options].sort((a, b) => a.walkM - b.walkM)[0];
  const eligibleOptions = r.options.filter((o) => o.eligible);
  return (
    <article
      id={`r-${r.restaurant.id}`}
      data-testid="restaurant-card"
      className={cn("rounded-2xl border bg-card p-3 shadow-[var(--shadow-card)] transition", selected ? "border-primary ring-2 ring-primary/20" : "border-border", !r.eligible && "opacity-75")}
    >
      <button type="button" onClick={onSelect} className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={selected}>
        <div className="min-w-0">
          {rank !== undefined && (
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold", rank === 1 ? "bg-gradient-signal text-signal-foreground" : "bg-muted text-muted-foreground")}>#{rank}</span>
          )}
          <h2 className="mt-1 font-display text-base font-bold leading-tight">{r.restaurant.name}</h2>
          <p className="text-xs text-muted-foreground">
            {r.restaurant.cuisine} · {PRICE_LABEL[r.restaurant.price]} · <Star className="inline h-3 w-3 fill-signal text-signal" /> {r.restaurant.rating}
          </p>
        </div>
        {option && <ScoreRing score={option.score} size={46} />}
      </button>

      {option ? (
        <div className="mt-2 rounded-xl bg-muted/60 p-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <AccessBadge access={option.park.parking.access} />
            <span className="truncate">{option.park.parking.name}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold">{option.park.cost === 0 ? "FREE" : `₹${option.park.cost}`}</span>
            <AvailabilityBadge status={option.park.status} pct={option.park.availabilityPct} />
            <span className="text-muted-foreground">
              {option.walkM} m {option.walkSource === "route" ? "route" : "est."} · {option.straightM} m straight
            </span>
            <SafetyBadge safety={option.park.safety} />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-busy">No parking fits{nearest ? ` — nearest: ${nearest.park.parking.name}: ${nearest.issues[0]}` : ""}</p>
      )}

      {selected && option && (
        <div className="mt-3 space-y-3">
          {eligibleOptions.length > 1 && (
            <div role="radiogroup" aria-label={`Parking options for ${r.restaurant.name}`} className="space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Other eligible parking</div>
              {eligibleOptions.map((o) => (
                <button
                  key={o.park.parking.id}
                  type="button"
                  role="radio"
                  aria-checked={o === option}
                  onClick={() => onPickParking(o.park.parking.id)}
                  className={cn("flex w-full items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-xs", o === option ? "border-primary bg-accent/50" : "border-border hover:border-primary/50")}
                >
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{o.park.parking.name}</span>
                    {o === r.best && <span className="ml-1 text-[10px] text-primary">best</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
                    {o.park.cost === 0 ? "₹0" : `₹${o.park.cost}`} · {o.park.availabilityPct}% · {o.walkM} m · <span className="font-semibold text-foreground">S{o.park.safety.score}</span> · {o.score}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1.5 text-xs">
            <AuthStatus authorisation={option.park.parking.authorisation} operator={option.park.parking.operator} />
            <SafetyAttributes safety={option.park.safety} />
            <p className="text-muted-foreground">
              Facility safety is synthetic. Walk: {walkingRouteNote(option.walkM, c.arrival, c.hours).text}.
            </p>
            <p className="text-muted-foreground">
              {option.park.parking.access === "free" ? "Free (₹0)" : chargesText(option.park.parking)} · ~{option.park.searchMin} min to park
              {option.park.parking.note ? ` · ${option.park.parking.note}` : ""}
            </p>
          </div>

          {text && option === r.best && (
            <div className="rounded-xl bg-accent/50 p-2 text-xs">
              <p className="font-semibold">{text.headline}</p>
              <p className="mt-0.5 text-muted-foreground">{text.reasoning}</p>
              {text.tradeoff && <p className="mt-1"><span className="font-semibold">Free vs paid: </span>{text.tradeoff}</p>}
              <p className="mt-1 flex gap-1"><Lightbulb className="mt-0.5 h-3 w-3 shrink-0 text-signal" />{text.tip}</p>
              {aiWorking && <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Updating…</p>}
            </div>
          )}

          <details className="rounded-xl border border-border p-2 text-xs">
            <summary className="cursor-pointer font-semibold">Score breakdown{text?.rankReason ? ` · why #${rank}` : ""}</summary>
            {text?.rankReason && option === r.best && <p className="mt-2 text-muted-foreground">{text.rankReason}</p>}
            <div className="mt-2 space-y-1">
              {FACTORS.map((f) => (
                <div key={f.key} className="flex items-center gap-2 text-[11px]">
                  <span className="w-20 text-muted-foreground">{f.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-primary" style={{ width: `${Math.round(option.breakdown[f.key] * 100)}%` }} />
                  </div>
                  <span className="w-14 text-right text-muted-foreground">{Math.round(option.weights[f.key] * option.breakdown[f.key] * 100)}/{Math.round(option.weights[f.key] * 100)}</span>
                </div>
              ))}
            </div>
          </details>

          <Button asChild variant="signal" className="w-full">
            <Link to="/plan" search={{ ...search, restaurant: r.restaurant.id, parking: option.park.parking.id }}>
              Plan this visit <ArrowRight />
            </Link>
          </Button>
        </div>
      )}
    </article>
  );
}

function LayerToggle({ active, onClick, icon: Icon, label, tone }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; tone: "dine" | "ink" | "ok" | "primary" | "busy" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold transition",
        active
          ? { dine: "bg-dine text-dine-foreground", ink: "bg-ink text-ink-foreground", ok: "bg-ok text-ink-foreground", primary: "bg-primary text-primary-foreground", busy: "bg-busy text-ink-foreground" }[tone]
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}
