import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Ban, Car, Navigation, X, Footprints, IndianRupee, Search, ShieldCheck, Sparkles, Star, Timer, UtensilsCrossed } from "lucide-react";
import { AppShell, SimulatedNotice } from "@/components/AppShell";
import { MapView } from "@/components/MapView";
import type { MapPin } from "@/components/map-types";
import { AccessBadge, AuthStatus, AvailabilityBadge, CriteriaBar, PrefToggle } from "@/components/parking-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { evaluateArea } from "@/lib/engine";
import { getWalkingRoute } from "@/lib/route.functions";
import { BUDGET_RANGE, cleanSearch, criteriaSearchSchema, toCriteria, WALK_RANGE } from "@/lib/search";
import { chargesText, directionsUrl, hoursText, PRICE_LABEL, walkingUrl } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/map")({
  validateSearch: zodValidator(criteriaSearchSchema),
  head: () => ({
    meta: [
      { title: "Parking map — ParkWise GeoAI" },
      { name: "description", content: "Interactive map of restaurants and authorised parking facilities with simulated availability, cost and walking distance." },
      { property: "og:title", content: "Restaurants & authorised parking map — ParkWise GeoAI" },
      { property: "og:description", content: "See restaurants and nearby authorised parking side by side on an interactive map." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: MapScreen,
});

function MapScreen() {
  const raw = Route.useSearch();
  const search = cleanSearch(raw);
  const navigate = useNavigate({ from: "/map" });
  const c = toCriteria(search);
  const ev = useMemo(() => evaluateArea(c), [c.area, c.arrival, c.day, c.hours, c.budget, c.walk, c.pref]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showDine, setShowDine] = useState(true);
  const [layers, setLayers] = useState({ free: true, paid: true, shared: true, restricted: true });
  const toggleLayer = (k: keyof typeof layers) => setLayers((l) => ({ ...l, [k]: !l[k] }));
  const [selX, setSelX] = useState<string | null>(null);
  const [onlyEligible, setOnlyEligible] = useState(false);
  const [cuisine, setCuisine] = useState("all");
  const [selR, setSelR] = useState<string | null>(null);
  const [selP, setSelP] = useState<string | null>(null);
  const [tab, setTab] = useState("restaurants");
  const [budget, setBudget] = useState(c.budget);
  const [walk, setWalk] = useState(c.walk);

  useEffect(() => setBudget(c.budget), [c.budget]);
  useEffect(() => setWalk(c.walk), [c.walk]);
  useEffect(() => {
    setSelR(null);
    setSelP(null);
    setCuisine("all");
  }, [c.area]);

  const cuisines = useMemo(() => Array.from(new Set(ev.area.restaurants.map((r) => r.cuisine))).sort(), [ev.area]);
  const visibleRestaurants = ev.restaurants.filter(
    (r) => (cuisine === "all" || r.restaurant.cuisine === cuisine) && (!onlyEligible || r.eligible),
  );
  const selected = ev.restaurants.find((r) => r.restaurant.id === selR) ?? null;
  const selectedOption = selected
    ? (selected.options.find((o) => o.park.parking.id === selP) ?? selected.best)
    : null;

  const update = (patch: Partial<typeof search>) => navigate({ search: (prev) => cleanSearch({ ...prev, ...patch }), replace: true });

  const dinePins: MapPin[] = showDine
    ? visibleRestaurants.map((r) => ({
        id: r.restaurant.id,
        name: r.restaurant.name,
        lat: r.restaurant.lat,
        lng: r.restaurant.lng,
        dim: !r.eligible,
        popupLines: [
          `${r.restaurant.cuisine} · ${PRICE_LABEL[r.restaurant.price]} · ★ ${r.restaurant.rating}`,
          r.restaurant.blurb,
          r.best
            ? `Best parking: ${r.best.park.parking.name} — ${r.best.walkM} m walk, ₹${r.best.park.cost}, ${r.best.park.availabilityPct}% free (simulated)`
            : "No authorised parking within your budget and walking limit",
        ],
      }))
    : [];
  const parkPins: MapPin[] = [
    ...ev.parkings.filter((p) => layers[p.parking.access]).map((p) => ({
        id: p.parking.id,
        name: p.parking.name,
        lat: p.parking.lat,
        lng: p.parking.lng,
        status: p.status,
        variant: p.parking.access,
        popupLines: [
          `${p.parking.access.toUpperCase()} · ${p.parking.authorisation === "shared-permission" ? "✓ Shared with verified owner permission" : "✓ Verified authorised"} · ${p.parking.operator}`,
          p.open
            ? `Simulated availability: ${p.availabilityPct}% (~${p.freeSpots} of ${p.parking.capacity} spots)`
            : `Not available for your stay (open ${hoursText(p.parking)})`,
          p.parking.access === "free" ? "Charges: free (₹0)" : `Charges: ${chargesText(p.parking)} → ₹${p.cost} for ${c.hours} h`,
          p.open ? `Expected search time: ~${p.searchMin} min` : "",
        ].filter(Boolean),
      })),
    ...(layers.restricted
      ? ev.excluded.map((p) => ({
          id: p.id,
          name: p.name,
          lat: p.lat,
          lng: p.lng,
          variant: "restricted" as const,
          popupLines: ["Not legal parking — never recommended", p.note ?? ""],
        }))
      : []),
  ];

  // Real OSM walking route for the selected pair; falls back to a straight line while loading or if unavailable.
  const fetchRoute = useServerFn(getWalkingRoute);
  const routeQ = useQuery({
    queryKey: ["walk-route", selectedOption?.park.parking.id, selected?.restaurant.id],
    queryFn: () => fetchRoute({ data: { parkingId: selectedOption!.park.parking.id, restaurantId: selected!.restaurant.id } }),
    enabled: !!selected && !!selectedOption,
    staleTime: Infinity,
    retry: false,
  });
  const walkRoute = selected && selectedOption ? (routeQ.data ?? null) : null;
  const route: [number, number][] | null =
    selected && selectedOption
      ? (walkRoute?.coords ?? [
          [selectedOption.park.parking.lat, selectedOption.park.parking.lng],
          [selected.restaurant.lat, selected.restaurant.lng],
        ])
      : null;

  const isDesktop = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
  const showMap = () => {
    if (!isDesktop()) document.getElementById("pw-map")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const selectRestaurant = (id: string, fromList = false) => {
    setSelR(id);
    setSelP(null);
    setSelX(null);
    setTab("restaurants");
    if (fromList) showMap();
    else if (isDesktop()) document.getElementById(`r-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const selectParking = (id: string, fromList = false) => {
    if (ev.excluded.some((x) => x.id === id)) {
      setSelX(id);
      setSelR(null);
      setSelP(null);
      return;
    }
    setSelX(null);
    setSelP(id);
    if (!selR) setTab("parking");
    if (fromList) showMap();
    else if (isDesktop()) document.getElementById(`p-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const clearSelection = () => {
    setSelR(null);
    setSelP(null);
    setSelX(null);
  };
  const selectedX = selX ? (ev.excluded.find((x) => x.id === selX) ?? null) : null;
  const nearestFor = (pid: string) =>
    ev.restaurants
      .map((r) => ({ r, o: r.options.find((o) => o.park.parking.id === pid)! }))
      .sort((a, b) => a.o.walkM - b.o.walkM)[0];
  const selectedPark = !selected && selP ? (ev.parkings.find((p) => p.parking.id === selP) ?? null) : null;
  const servedBy = selectedPark
    ? ev.restaurants.filter((r) => r.options.some((o) => o.park.parking.id === selectedPark.parking.id && o.eligible))
    : [];

  return (
    <AppShell search={search}>
      <div className="mx-auto max-w-7xl px-4 py-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{ev.area.name}</h1>
            <p className="text-sm text-muted-foreground">{ev.area.tagline}</p>
          </div>
          <Button asChild variant="signal" size="lg">
            <Link to="/recommendations" search={search}>
              Get AI recommendations <Sparkles />
            </Link>
          </Button>
        </div>
        <div className="mt-3"><CriteriaBar search={search} /></div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[380px_1fr]">
          {/* Map first on mobile */}
          <div id="pw-map" className="relative order-1 scroll-mt-28 lg:order-2">
            <MapView
              center={ev.area.center}
              zoom={ev.area.zoom}
              fitKey={ev.area.id}
              restaurants={dinePins}
              parkings={parkPins}
              selectedRestaurantId={selR}
              selectedParkingId={selectedOption?.park.parking.id ?? selP}
              onSelectRestaurant={(id) => selectRestaurant(id)}
              onSelectParking={(id) => selectParking(id)}
              route={route}
              showPopups={false}
              zones={layers.restricted ? ev.area.zones : []}
              walkCircle={selected ? { center: [selected.restaurant.lat, selected.restaurant.lng], radius: c.walk / 1.3 } : null}
              className="h-[52vh] w-full overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-card)] lg:h-[calc(100vh-220px)] lg:min-h-[560px]"
            />
            <div className="pointer-events-none absolute left-14 right-3 top-3 z-[500] flex flex-col items-end gap-2">
              <div className="pointer-events-auto flex flex-wrap justify-end gap-1 rounded-xl bg-card/95 p-1 shadow-[var(--shadow-card)] backdrop-blur">
                <LayerToggle active={showDine} onClick={() => setShowDine((v) => !v)} icon={UtensilsCrossed} label="Restaurants" tone="dine" />
                <LayerToggle active={layers.free} onClick={() => toggleLayer("free")} icon={Car} label="Free" tone="ok" />
                <LayerToggle active={layers.paid} onClick={() => toggleLayer("paid")} icon={Car} label="Paid" tone="ink" />
                <LayerToggle active={layers.shared} onClick={() => toggleLayer("shared")} icon={Car} label="Shared" tone="primary" />
                <LayerToggle active={layers.restricted} onClick={() => toggleLayer("restricted")} icon={Ban} label="Restricted" tone="busy" />
              </div>
            </div>
            <div className="absolute bottom-3 left-3 z-[500] rounded-xl bg-card/95 px-3 py-2 text-[11px] shadow-[var(--shadow-card)] backdrop-blur">
              <div className="mb-1 font-semibold">Simulated availability</div>
              <div className="flex gap-3">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-ok" /> Good</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warn" /> Limited</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-busy" /> Nearly full</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-ok" /> Free</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-ink" /> Paid</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Shared</span>
                <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-busy" /> Restricted</span>
              </div>
            </div>
            {selected && (
              <div className="relative z-[500] mt-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-float)] sm:absolute sm:bottom-16 sm:right-3 sm:mt-0 sm:w-80">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-base font-bold">{selected.restaurant.name}</div>
                    <div className="text-xs text-muted-foreground">{selected.restaurant.cuisine} · {PRICE_LABEL[selected.restaurant.price]} · ★ {selected.restaurant.rating}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{selected.restaurant.blurb}</div>
                  </div>
                  <button className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={clearSelection} aria-label="Close details"><X className="h-4 w-4" /></button>
                </div>
                {selectedOption ? (
                  <>
                    <div className="mt-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {selectedOption === selected.best ? "Recommended parking" : "Selected parking"}
                    </div>
                    <div className="text-sm">
                      <span className="font-semibold">{selectedOption.park.parking.name}</span>
                      {!selectedOption.eligible && <span className="ml-1 text-xs text-busy">({selectedOption.issues[0]})</span>}
                    </div>
                    <AuthStatus authorisation={selectedOption.park.parking.authorisation} operator={selectedOption.park.parking.operator} />
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <AvailabilityBadge status={selectedOption.park.status} pct={selectedOption.park.availabilityPct} />
                      <AccessBadge access={selectedOption.park.parking.access} />
                      <span className="inline-flex items-center gap-1" title={walkRoute ? "OpenStreetMap walking route; straight-line distance in brackets" : "Estimated walking route (straight line × 1.3); straight-line distance in brackets"}><Footprints className="h-3 w-3" />{walkRoute ? `${walkRoute.distanceM} m OSM route` : `~${selectedOption.walkM} m est.`} ({selectedOption.straightM} m straight)</span>
                      <span className="inline-flex items-center gap-1"><IndianRupee className="h-3 w-3" />{selectedOption.park.cost}</span>
                      <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" />~{selectedOption.park.searchMin} min search</span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">Tap another P marker to compare parking for this restaurant.</p>
                    <Button asChild size="sm" className="mt-2 w-full">
                      <Link to="/plan" search={{ ...search, restaurant: selected.restaurant.id, parking: selectedOption.eligible ? selectedOption.park.parking.id : "" }}>
                        Plan this visit <ArrowRight />
                      </Link>
                    </Button>
                    <a
                      href={walkingUrl(selectedOption.park.parking, selected.restaurant)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex items-center justify-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      <Footprints className="h-3 w-3" /> Walking route from parking (Google Maps)
                    </a>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No authorised parking fits your budget and walking limit. Try widening them.</p>
                )}
              </div>
            )}
            {selectedX && (
              <div className="relative z-[500] mt-3 rounded-2xl border border-busy/40 bg-card p-4 shadow-[var(--shadow-float)] sm:absolute sm:bottom-16 sm:right-3 sm:mt-0 sm:w-80">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-busy font-bold text-ink-foreground">✕</span>
                    <div>
                      <div className="font-display text-base font-bold leading-tight">{selectedX.name}</div>
                      <div className="text-[11px] font-semibold text-busy">{selectedX.authorisation === "restricted" ? "Restricted — no parking" : "Unverified — not authorised"}</div>
                    </div>
                  </div>
                  <button className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={clearSelection} aria-label="Close details"><X className="h-4 w-4" /></button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{selectedX.note}</p>
                <p className="mt-2 text-xs">ParkWise never recommends this space. A vacant roadside space is not legal parking just because it looks empty.</p>
              </div>
            )}
            {selectedPark && (
              <div className="relative z-[500] mt-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-float)] sm:absolute sm:bottom-16 sm:right-3 sm:mt-0 sm:w-80">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink font-display font-extrabold text-ink-foreground">P</span>
                    <div>
                      <div className="font-display text-base font-bold leading-tight">{selectedPark.parking.name}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5"><AccessBadge access={selectedPark.parking.access} /><AuthStatus authorisation={selectedPark.parking.authorisation} operator={selectedPark.parking.operator} /></div>
                      {selectedPark.parking.note && <div className="mt-1 text-[11px] text-muted-foreground">{selectedPark.parking.note}</div>}
                    </div>
                  </div>
                  <button className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" onClick={clearSelection} aria-label="Close details"><X className="h-4 w-4" /></button>
                </div>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
                  <dt className="text-muted-foreground">Availability</dt>
                  <dd className="flex flex-wrap items-center gap-1.5"><AvailabilityBadge status={selectedPark.status} pct={selectedPark.availabilityPct} />{selectedPark.open && <span>~{selectedPark.freeSpots} of {selectedPark.parking.capacity} spots</span>}</dd>
                  <dt className="text-muted-foreground">Charges</dt>
                  <dd>{selectedPark.parking.access === "free" ? "Free (₹0)" : chargesText(selectedPark.parking)}</dd>
                  <dt className="text-muted-foreground">Your stay</dt>
                  <dd className="font-semibold">₹{selectedPark.cost} for {c.hours} h {selectedPark.cost > c.budget && <span className="font-normal text-busy">(over your ₹{c.budget} budget)</span>}</dd>
                  <dt className="text-muted-foreground">Search time</dt>
                  <dd>{selectedPark.open ? `~${selectedPark.searchMin} min (simulated)` : "—"}</dd>
                  <dt className="text-muted-foreground">Open</dt>
                  <dd>{hoursText(selectedPark.parking)} · {selectedPark.parking.kind}</dd>
                  <dt className="text-muted-foreground">Nearest dining</dt>
                  <dd>{(() => { const n = nearestFor(selectedPark.parking.id); return n ? `${n.r.restaurant.name}: ~${n.o.walkM} m walk (${n.o.straightM} m straight line)` : "—"; })()}</dd>
                  <dt className="text-muted-foreground">Fits for</dt>
                  <dd>{servedBy.length ? `${servedBy.length} restaurant${servedBy.length > 1 ? "s" : ""} within your limits` : "No restaurants within your limits"}</dd>
                </dl>
                <Button asChild size="sm" variant="signal" className="mt-3 w-full">
                  <a href={directionsUrl(selectedPark.parking.lat, selectedPark.parking.lng)} target="_blank" rel="noopener noreferrer"><Navigation /> Directions in Google Maps</a>
                </Button>
              </div>
            )}
          </div>

          {/* Panel */}
          <aside className="order-2 flex flex-col gap-3 lg:order-1 lg:max-h-[calc(100vh-220px)] lg:min-h-[560px]">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="grid gap-4">
                <div className="space-y-2">
                  <Label className="text-sm">Parking preference</Label>
                  <PrefToggle value={search.pref} onChange={(v) => update({ pref: v })} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><Label>Parking budget</Label><span className="font-bold">≤ ₹{budget}</span></div>
                  <Slider aria-label="Parking budget" min={BUDGET_RANGE.min} max={BUDGET_RANGE.max} step={BUDGET_RANGE.step} value={[budget]} onValueChange={([v]) => setBudget(v ?? budget)} onValueCommit={([v]) => update({ budget: v ?? budget })} />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm"><Label>Max walk</Label><span className="font-bold">≤ {walk} m</span></div>
                  <Slider aria-label="Maximum walking distance" min={WALK_RANGE.min} max={WALK_RANGE.max} step={WALK_RANGE.step} value={[walk]} onValueChange={([v]) => setWalk(v ?? walk)} onValueCommit={([v]) => update({ walk: v ?? walk })} />
                </div>
                <div className="flex items-center gap-3">
                  <Select value={cuisine} onValueChange={setCuisine}>
                    <SelectTrigger className="h-9 flex-1" aria-label="Cuisine"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All cuisines</SelectItem>
                      {cuisines.map((cu) => <SelectItem key={cu} value={cu}>{cu}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <label className="flex items-center gap-2 text-xs font-medium">
                    <Switch checked={onlyEligible} onCheckedChange={setOnlyEligible} aria-label="Only with parking" />
                    Fits limits
                  </label>
                </div>
              </div>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="restaurants">Restaurants ({visibleRestaurants.length})</TabsTrigger>
                <TabsTrigger value="parking">Parking ({ev.parkings.filter((p) => layers[p.parking.access]).length})</TabsTrigger>
              </TabsList>
              <TabsContent value="restaurants" className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {visibleRestaurants.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    <Search className="mx-auto mb-2 h-5 w-5" /> No restaurants match these filters.
                  </div>
                )}
                {visibleRestaurants.map((r) => (
                  <button
                    key={r.restaurant.id}
                    id={`r-${r.restaurant.id}`}
                    onClick={() => selectRestaurant(r.restaurant.id, true)}
                    className={cn(
                      "w-full rounded-xl border bg-card p-3 text-left transition hover:border-primary/50",
                      selR === r.restaurant.id ? "border-primary ring-2 ring-primary/20" : "border-border",
                      !r.eligible && "opacity-70",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-semibold">{r.restaurant.name}</div>
                        <div className="text-xs text-muted-foreground">{r.restaurant.cuisine} · {PRICE_LABEL[r.restaurant.price]} · <Star className="inline h-3 w-3 fill-signal text-signal" /> {r.restaurant.rating}</div>
                      </div>
                      {r.best && <span className="rounded-md bg-accent px-1.5 py-0.5 font-display text-xs font-bold text-accent-foreground">{r.best.score}</span>}
                    </div>
                    {r.best ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <AvailabilityBadge status={r.best.park.status} pct={r.best.park.availabilityPct} />
                        <span><Footprints className="mr-0.5 inline h-3 w-3" />{r.best.walkM} m</span>
                        <AccessBadge access={r.best.park.parking.access} />
                        <span>{r.best.park.cost === 0 ? "₹0" : `₹${r.best.park.cost}`}</span>
                        <span className="truncate">· {r.best.park.parking.name}</span>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-busy">{search.pref === "free" ? "No verified free parking within your limits" : "No authorised parking within your limits"}</div>
                    )}
                  </button>
                ))}
              </TabsContent>
              <TabsContent value="parking" className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {ev.parkings.filter((p) => layers[p.parking.access]).map((p) => (
                  <button
                    key={p.parking.id}
                    id={`p-${p.parking.id}`}
                    onClick={() => { setSelR(null); selectParking(p.parking.id, true); }}
                    className={cn("w-full rounded-xl border bg-card p-3 text-left transition hover:border-primary/50", selP === p.parking.id ? "border-primary ring-2 ring-primary/20" : "border-border")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-md font-display text-sm font-extrabold", p.parking.access === "free" ? "bg-ok text-ink-foreground" : p.parking.access === "shared" ? "bg-primary text-primary-foreground" : "bg-ink text-ink-foreground")}>P</span>
                        <div>
                          <div className="font-semibold leading-tight">{p.parking.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5"><AccessBadge access={p.parking.access} /><AuthStatus authorisation={p.parking.authorisation} operator={p.parking.operator} /></div>
                        </div>
                      </div>
                      <AvailabilityBadge status={p.status} pct={p.availabilityPct} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>~{p.freeSpots}/{p.parking.capacity} free</span>
                      <span>{p.cost === 0 ? "Free" : `₹${p.cost} for ${c.hours} h`}</span>
                      {search.pref === "free" && p.cost > 0 && <span className="text-busy">Excluded: free-only</span>}
                      <span>~{p.searchMin} min search</span>
                      <span>Open {hoursText(p.parking)}</span>
                    </div>
                  </button>
                ))}
                {ev.excluded.length > 0 && (
                  <div className="rounded-xl border border-dashed border-busy/40 p-3 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-busy"><Ban className="h-3.5 w-3.5" /> Never recommended ({ev.excluded.length})</div>
                    <ul className="mt-1.5 space-y-1 text-muted-foreground">
                      {ev.excluded.map((x) => (
                        <li key={x.id}>
                          <button className="text-left hover:text-foreground" onClick={() => selectParking(x.id, true)}>
                            <span className="font-medium">{x.name}</span> — {x.authorisation === "restricted" ? "restricted" : "unverified"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </TabsContent>
            </Tabs>
            <SimulatedNotice />
          </aside>
        </div>
      </div>
    </AppShell>
  );
}

function LayerToggle({ active, onClick, icon: Icon, label, tone }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; tone: "dine" | "ink" | "ok" | "primary" | "busy" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
        active
          ? { dine: "bg-dine text-dine-foreground", ink: "bg-ink text-ink-foreground", ok: "bg-ok text-ink-foreground", primary: "bg-primary text-primary-foreground", busy: "bg-busy text-ink-foreground" }[tone]
          : "text-muted-foreground hover:bg-muted",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
