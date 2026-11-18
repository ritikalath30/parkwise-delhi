import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Car, Footprints, IndianRupee, Search, ShieldCheck, Sparkles, Star, Timer, UtensilsCrossed } from "lucide-react";
import { AppShell, SimulatedNotice } from "@/components/AppShell";
import { MapView } from "@/components/MapView";
import type { MapPin } from "@/components/map-types";
import { AvailabilityBadge, CriteriaBar } from "@/components/parking-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { evaluateArea } from "@/lib/engine";
import { BUDGET_RANGE, cleanSearch, criteriaSearchSchema, toCriteria, WALK_RANGE } from "@/lib/search";
import { PRICE_LABEL } from "@/lib/ui-helpers";
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
  const ev = useMemo(() => evaluateArea(c), [c.area, c.arrival, c.day, c.hours, c.budget, c.walk]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showDine, setShowDine] = useState(true);
  const [showPark, setShowPark] = useState(true);
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
        popup: r.best
          ? `${r.restaurant.cuisine} · ★ ${r.restaurant.rating} · Best parking: ${r.best.walkM} m, ₹${r.best.park.cost}`
          : `${r.restaurant.cuisine} · No authorised parking within your limits`,
      }))
    : [];
  const parkPins: MapPin[] = showPark
    ? ev.parkings.map((p) => ({
        id: p.parking.id,
        name: p.parking.name,
        lat: p.parking.lat,
        lng: p.parking.lng,
        status: p.status,
        popup: p.open ? `${p.parking.kind} · ~${p.freeSpots} free (simulated) · ₹${p.cost}` : "Closed at your arrival time",
      }))
    : [];

  const route: [number, number][] | null =
    selected && selectedOption
      ? [
          [selectedOption.park.parking.lat, selectedOption.park.parking.lng],
          [selected.restaurant.lat, selected.restaurant.lng],
        ]
      : null;

  const selectRestaurant = (id: string) => {
    setSelR(id);
    setSelP(null);
    setTab("restaurants");
    document.getElementById(`r-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };
  const selectParking = (id: string) => {
    setSelP(id);
    if (!selR) setTab("parking");
    document.getElementById(`p-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

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
          <div className="relative order-1 lg:order-2">
            <MapView
              center={ev.area.center}
              zoom={ev.area.zoom}
              fitKey={ev.area.id}
              restaurants={dinePins}
              parkings={parkPins}
              selectedRestaurantId={selR}
              selectedParkingId={selectedOption?.park.parking.id ?? selP}
              onSelectRestaurant={selectRestaurant}
              onSelectParking={selectParking}
              route={route}
              walkCircle={selected ? { center: [selected.restaurant.lat, selected.restaurant.lng], radius: c.walk / 1.3 } : null}
              className="h-[52vh] w-full overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-card)] lg:h-[calc(100vh-220px)] lg:min-h-[560px]"
            />
            <div className="pointer-events-none absolute right-3 top-3 z-[500] flex flex-col gap-2">
              <div className="pointer-events-auto flex gap-1 rounded-xl bg-card/95 p-1 shadow-[var(--shadow-card)] backdrop-blur">
                <LayerToggle active={showDine} onClick={() => setShowDine((v) => !v)} icon={UtensilsCrossed} label="Restaurants" tone="dine" />
                <LayerToggle active={showPark} onClick={() => setShowPark((v) => !v)} icon={Car} label="Parking" tone="ink" />
              </div>
            </div>
            <div className="absolute bottom-3 left-3 z-[500] rounded-xl bg-card/95 px-3 py-2 text-[11px] shadow-[var(--shadow-card)] backdrop-blur">
              <div className="mb-1 font-semibold">Simulated availability</div>
              <div className="flex gap-3">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-ok" /> Good</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warn" /> Limited</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-busy" /> Nearly full</span>
              </div>
            </div>
            {selected && (
              <div className="absolute inset-x-3 bottom-16 z-[500] rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-float)] sm:left-auto sm:w-80">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-display text-base font-bold">{selected.restaurant.name}</div>
                    <div className="text-xs text-muted-foreground">{selected.restaurant.cuisine} · ★ {selected.restaurant.rating}</div>
                  </div>
                  <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setSelR(null); setSelP(null); }} aria-label="Close">✕</button>
                </div>
                {selectedOption ? (
                  <>
                    <div className="mt-2 text-sm">
                      <span className="font-semibold">{selectedOption.park.parking.name}</span>
                      {!selectedOption.eligible && <span className="ml-1 text-xs text-busy">({selectedOption.issues[0]})</span>}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <AvailabilityBadge status={selectedOption.park.status} pct={selectedOption.park.availabilityPct} />
                      <span className="inline-flex items-center gap-1"><Footprints className="h-3 w-3" />{selectedOption.walkM} m</span>
                      <span className="inline-flex items-center gap-1"><IndianRupee className="h-3 w-3" />{selectedOption.park.cost}</span>
                      <span className="inline-flex items-center gap-1"><Timer className="h-3 w-3" />~{selectedOption.park.searchMin} min search</span>
                    </div>
                    <Button asChild size="sm" className="mt-3 w-full">
                      <Link to="/plan" search={{ ...search, restaurant: selected.restaurant.id, parking: selectedOption.eligible ? selectedOption.park.parking.id : "" }}>
                        Plan this visit <ArrowRight />
                      </Link>
                    </Button>
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">No authorised parking fits your budget and walking limit. Try widening them.</p>
                )}
              </div>
            )}
          </div>

          {/* Panel */}
          <aside className="order-2 flex flex-col gap-3 lg:order-1 lg:max-h-[calc(100vh-220px)] lg:min-h-[560px]">
            <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
              <div className="grid gap-4">
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
                <TabsTrigger value="parking">Parking ({ev.parkings.length})</TabsTrigger>
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
                    onClick={() => selectRestaurant(r.restaurant.id)}
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
                        <span>₹{r.best.park.cost}</span>
                        <span className="truncate">· {r.best.park.parking.name}</span>
                      </div>
                    ) : (
                      <div className="mt-2 text-xs text-busy">No authorised parking within your limits</div>
                    )}
                  </button>
                ))}
              </TabsContent>
              <TabsContent value="parking" className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                {ev.parkings.map((p) => (
                  <button
                    key={p.parking.id}
                    id={`p-${p.parking.id}`}
                    onClick={() => selectParking(p.parking.id)}
                    className={cn("w-full rounded-xl border bg-card p-3 text-left transition hover:border-primary/50", selP === p.parking.id ? "border-primary ring-2 ring-primary/20" : "border-border")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ink font-display text-sm font-extrabold text-ink-foreground">P</span>
                        <div>
                          <div className="font-semibold leading-tight">{p.parking.name}</div>
                          <div className="text-xs text-muted-foreground">{p.parking.kind} · {p.parking.operator}</div>
                        </div>
                      </div>
                      <AvailabilityBadge status={p.status} pct={p.availabilityPct} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>~{p.freeSpots}/{p.parking.capacity} free</span>
                      <span>₹{p.cost} for {c.hours} h</span>
                      <span>~{p.searchMin} min search</span>
                      <span>Open {p.parking.openFrom}:00–{p.parking.openTo === 24 ? "24" : p.parking.openTo}:00</span>
                    </div>
                  </button>
                ))}
                {ev.excludedUnverified > 0 && (
                  <div className="flex items-start gap-2 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-ok" />
                    {ev.excludedUnverified} unverified roadside spot{ev.excludedUnverified > 1 ? "s" : ""} hidden. ParkWise only shows authorised facilities.
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

function LayerToggle({ active, onClick, icon: Icon, label, tone }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; tone: "dine" | "ink" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition",
        active ? (tone === "dine" ? "bg-dine text-dine-foreground" : "bg-ink text-ink-foreground") : "text-muted-foreground hover:bg-muted",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
