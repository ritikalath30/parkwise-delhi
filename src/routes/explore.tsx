import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Car, ChevronDown, Clock, Footprints, Info, Loader2, MapPin, RefreshCw, SlidersHorizontal } from "lucide-react";
import { AppShell, SimulatedNotice } from "@/components/AppShell";
import { MapView } from "@/components/MapView";
import type { MapPin as Pin } from "@/components/map-types";
import { AvailabilityTag, CategoryBadge, FacilityFacts, OptionTags, parkingName } from "@/components/parking-ui";
import { TripAdjuster } from "@/components/TripAdjuster";
import { Button } from "@/components/ui/button";
import { PROVIDERS } from "@/lib/availability";
import { evaluate, formatTime, suggestFixes, type Option, type RestaurantEval } from "@/lib/engine";
import { usePlaceData } from "@/lib/places/usePlaceData";
import { getWalkingRoute } from "@/lib/route.functions";
import { cleanSearch, criteriaPatchToSearch, criteriaSearchSchema, hasDestination, toCriteria, type CleanSearch } from "@/lib/search";
import { formatDate } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/explore")({
  validateSearch: zodValidator(criteriaSearchSchema),
  beforeLoad: ({ search }) => {
    if (!hasDestination(cleanSearch(search))) throw redirect({ to: "/", search: cleanSearch(search) });
  },
  head: () => ({
    meta: [
      { title: "Explore restaurants & parking — ParkWise" },
      { name: "description", content: "Restaurants near your destination with public parking that fits your budget, time and walking distance." },
      { property: "og:title", content: "Explore restaurants & parking — ParkWise" },
      { property: "og:description", content: "Restaurants with public parking nearby, on one map." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExploreScreen,
});

type Layers = { dine: boolean; free: boolean; paid: boolean; unknown: boolean; excluded: boolean };

function ExploreScreen() {
  const search = cleanSearch(Route.useSearch()) as CleanSearch & { lat: number; lng: number };
  const navigate = useNavigate({ from: "/explore" });
  const c = toCriteria(search);
  const places = usePlaceData(search.lat, search.lng);
  const data = places.data;
  const searchKey = JSON.stringify(c);
  const ev = useMemo(() => (data && !data.error ? evaluate(data, c) : null), [data, searchKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const fixes = useMemo(() => (data && ev && ev.top.length === 0 && data.restaurants.length ? suggestFixes(data, c) : []), [ev]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = (patch: Partial<CleanSearch>) => navigate({ search: (prev) => cleanSearch({ ...prev, ...patch }), replace: true, resetScroll: false });

  const [selR, setSelR] = useState<string | null>(null);
  const [selP, setSelP] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layers, setLayers] = useState<Layers>({ dine: true, free: true, paid: true, unknown: true, excluded: false });
  useEffect(() => {
    setSelR(null);
    setSelP(null);
  }, [search.lat, search.lng]);

  const selected = ev ? (ev.restaurants.find((r) => r.restaurant.id === selR) ?? ev.top[0] ?? null) : null;
  const option = selected ? (selected.options.find((o) => o.eligible && o.parking.id === selP) ?? selected.best) : null;
  const eligibleIds = new Set(selected?.options.filter((o) => o.eligible).map((o) => o.parking.id));

  const fetchRoute = useServerFn(getWalkingRoute);
  const routeQ = useQuery({
    queryKey: ["walk-route", option?.parking.id, selected?.restaurant.id],
    queryFn: () => fetchRoute({ data: { lat: search.lat, lng: search.lng, parkingId: option!.parking.id, restaurantId: selected!.restaurant.id } }),
    enabled: !!selected && !!option,
    staleTime: Infinity,
    retry: false,
  });

  const selectRestaurant = (id: string) => {
    setSelR(id);
    setSelP(null);
    if (ev && !ev.top.some((t) => t.restaurant.id === id)) setShowAll(true);
    requestAnimationFrame(() => document.getElementById(`r-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const selectParking = (id: string) => {
    if (selected && eligibleIds.has(id)) setSelP(id);
  };

  const restaurantPins: Pin[] =
    ev && layers.dine ? ev.restaurants.map((r) => ({ id: r.restaurant.id, name: r.restaurant.name, lat: r.restaurant.lat, lng: r.restaurant.lng, dim: !r.eligible })) : [];
  const parkingPins: Pin[] = data && ev
    ? [
        ...data.parkings
          .filter((p) => (p.category === "free" ? layers.free : p.category === "paid" ? layers.paid : layers.unknown))
          .map((p) => {
            const o = selected?.options.find((x) => x.parking.id === p.id);
            return { id: p.id, name: parkingName(p), lat: p.lat, lng: p.lng, variant: p.category, level: o?.availability.level ?? null, dim: !!selected && !eligibleIds.has(p.id) };
          }),
        ...(layers.excluded ? data.excluded.map((x) => ({ id: x.id, name: `${x.name ?? "Parking"} (${x.reason})`, lat: x.lat, lng: x.lng, variant: "excluded" as const })) : []),
      ]
    : [];

  const listed = ev ? (showAll ? ev.restaurants : ev.top) : [];

  return (
    <AppShell search={search}>
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 truncate text-xl font-extrabold sm:text-2xl">
              <MapPin className="h-5 w-5 shrink-0 text-primary" /> {search.q || "Your destination"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {formatDate(c.dateISO)} · arrive {formatTime(c.arrival)} · {c.hours} h · {c.pref === "free" ? "free parking only" : `up to ₹${c.budget}`} · walk ≤ {c.walk} m
            </p>
          </div>
          <Button asChild variant="ghost" size="sm"><Link to="/" search={search}>Change destination</Link></Button>
        </div>

        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,430px)_1fr]">
          <div className="relative order-1 lg:order-2">
            <div className="lg:sticky lg:top-20">
              <MapView
                center={[search.lat, search.lng]}
                zoom={16}
                fitKey={`${search.lat},${search.lng},${data ? data.restaurants.length : 0}`}
                destination={{ lat: search.lat, lng: search.lng, name: search.q || "Destination" }}
                restaurants={restaurantPins}
                parkings={parkingPins}
                selectedRestaurantId={selected?.restaurant.id ?? null}
                selectedParkingId={option?.parking.id ?? null}
                onSelectRestaurant={selectRestaurant}
                onSelectParking={selectParking}
                route={routeQ.data?.coords ?? null}
                cluster
                className="h-[42vh] w-full overflow-hidden rounded-2xl border border-border shadow-[var(--shadow-card)] lg:h-[calc(100vh-120px)] lg:min-h-[560px]"
              />
              <MapLegend layers={layers} setLayers={setLayers} excludedCount={data?.excluded.length ?? 0} />
            </div>
          </div>

          <aside className="order-2 flex min-w-0 flex-col gap-3 lg:order-1">
            <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-card)]">
              <button className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold lg:hidden" onClick={() => setFiltersOpen((o) => !o)} aria-expanded={filtersOpen}>
                <span className="flex items-center gap-1.5"><SlidersHorizontal className="h-4 w-4 text-primary" /> Filters</span>
                <ChevronDown className={cn("h-4 w-4 transition", filtersOpen && "rotate-180")} />
              </button>
              <div className={cn("p-3 pt-0 lg:block lg:pt-3", !filtersOpen && "hidden")}>
                <TripAdjuster search={search} onChange={update} />
              </div>
            </div>

            {places.isLoading && (
              <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground" data-testid="loading">
                <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />
                Loading restaurants and parking from OpenStreetMap…
                <p className="mt-1 text-xs">Public map servers can take up to half a minute.</p>
              </div>
            )}

            {(places.isError || data?.error) && (
              <div className="rounded-2xl border border-busy/30 bg-busy/5 p-5 text-center text-sm" data-testid="data-error">
                <p className="font-semibold">Couldn't load map data</p>
                <p className="mt-1 text-muted-foreground">{data?.error ?? "The place data service didn't respond."} Nothing is shown rather than guessing.</p>
                <Button size="sm" className="mt-3" onClick={() => places.refetch()} disabled={places.isFetching}>
                  <RefreshCw className={cn(places.isFetching && "animate-spin")} /> Try again
                </Button>
              </div>
            )}

            {ev && data && (
              <>
                <p className="text-xs text-muted-foreground" data-testid="counts">
                  {data.restaurants.length} restaurants · {data.parkings.length} public car parks found nearby · {ev.top.length ? `${ev.restaurants.filter((r) => r.eligible).length} restaurants have parking that fits` : "none fit your filters"}
                </p>

                {data.restaurants.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center text-sm text-muted-foreground" data-testid="empty-state">
                    No restaurants are mapped within {700} m of this destination in OpenStreetMap. Try a more specific place.
                  </div>
                )}

                {data.restaurants.length > 0 && ev.top.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center" data-testid="empty-state">
                    <Car className="mx-auto h-7 w-7 text-muted-foreground" />
                    <h2 className="mt-2 font-bold">No parking fits these filters</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {data.parkings.length === 0 ? "No public parking is mapped within 1.5 km." : "We won't suggest parking that breaks your filters."}
                    </p>
                    {fixes.length > 0 && (
                      <div className="mt-3 flex flex-wrap justify-center gap-2">
                        {fixes.map((f) => (
                          <Button key={f.label} size="sm" onClick={() => update(criteriaPatchToSearch(f.patch))}>
                            {f.label} <span className="font-normal opacity-80">· {f.results} fit</span>
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {ev.top.length > 0 && <h2 className="text-sm font-bold">{showAll ? "All nearby restaurants" : "Recommended for your trip"}</h2>}
                {listed.map((r) => (
                  <RestaurantCard
                    key={r.restaurant.id}
                    r={r}
                    selected={selected?.restaurant.id === r.restaurant.id}
                    option={selected?.restaurant.id === r.restaurant.id ? option : r.best}
                    onSelect={() => selectRestaurant(r.restaurant.id)}
                    onPickParking={setSelP}
                    routeM={selected?.restaurant.id === r.restaurant.id ? (routeQ.data?.distanceM ?? null) : null}
                    search={search}
                  />
                ))}
                {ev.restaurants.length > ev.top.length && (
                  <Button variant="outline" onClick={() => setShowAll((s) => !s)}>
                    {showAll ? "Show recommended only" : `Show all ${ev.restaurants.length} restaurants`}
                  </Button>
                )}
                <DataSources fetchedAt={data.fetchedAt} places={data.sources.places} routes={data.sources.routes} />
              </>
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
  selected,
  option,
  onSelect,
  onPickParking,
  routeM,
  search,
}: {
  r: RestaurantEval;
  selected: boolean;
  option: Option | null;
  onSelect: () => void;
  onPickParking: (id: string) => void;
  routeM: number | null;
  search: CleanSearch;
}) {
  const eligible = r.options.filter((o) => o.eligible);
  return (
    <article id={`r-${r.restaurant.id}`} data-testid="restaurant-card" className={cn("rounded-2xl border bg-card p-3 shadow-[var(--shadow-card)] transition", selected ? "border-primary ring-2 ring-primary/20" : "border-border", !r.eligible && "opacity-75")}>
      <button type="button" onClick={onSelect} className="w-full text-left" aria-expanded={selected}>
        <h3 className="font-display text-base font-bold leading-tight">{r.restaurant.name}</h3>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {r.restaurant.cuisine && <span className="capitalize">{r.restaurant.cuisine}</span>}
          <span>{r.distanceM} m from destination</span>
          <span className="inline-flex items-center gap-0.5">
            <Clock className="h-3 w-3" />
            {r.openAtArrival === null ? "Hours unknown" : r.openAtArrival ? "Open at arrival" : "Closed at arrival"}
          </span>
        </p>
        {option ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
            <CategoryBadge category={option.parking.category} />
            <span className="max-w-[60%] truncate font-semibold">{parkingName(option.parking)}</span>
            <span className="text-muted-foreground">
              {option.cost === 0 ? "Free" : option.cost !== null ? `₹${option.cost}` : "Price unknown"} · {routeM ?? option.walkM} m walk
            </span>
            <AvailabilityTag a={option.availability} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-busy">{r.reason}</p>
        )}
      </button>

      {selected && option && (
        <div className="mt-3 space-y-2 border-t border-border pt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Parking options ({eligible.length})</div>
          <ul role="radiogroup" aria-label={`Parking for ${r.restaurant.name}`} className="space-y-1.5">
            {eligible.slice(0, 6).map((o) => (
              <li key={o.parking.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={o === option}
                  onClick={() => onPickParking(o.parking.id)}
                  className={cn("w-full rounded-xl border p-2 text-left text-xs", o === option ? "border-primary bg-accent/50" : "border-border hover:border-primary/50")}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CategoryBadge category={o.parking.category} />
                    <span className="font-semibold">{parkingName(o.parking)}</span>
                    <OptionTags tags={o.tags} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                    <span className="font-semibold text-foreground">{o.cost === 0 ? "Free" : o.cost !== null ? `₹${o.cost} for ${search.hours} h` : o.costLabel}</span>
                    <span className="inline-flex items-center gap-0.5"><Footprints className="h-3 w-3" />{o.walkM} m{o.walkSource === "estimate" ? " (est.)" : ""} · {o.walkMin} min</span>
                    <AvailabilityTag a={o.availability} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
          <div className="space-y-1 text-xs">
            <FacilityFacts p={option.parking} />
            <p className="text-muted-foreground">
              Hours: {option.parking.openingHours ?? "unknown"}
              {option.openForStay === null && option.parking.openingHours ? " (couldn't check against your stay)" : ""}
            </p>
          </div>
          <Button asChild variant="signal" className="w-full">
            <Link to="/plan" search={{ ...search, restaurant: r.restaurant.id, parking: option.parking.id }}>
              Plan this visit <ArrowRight />
            </Link>
          </Button>
        </div>
      )}
    </article>
  );
}

function MapLegend({ layers, setLayers, excludedCount }: { layers: Layers; setLayers: (f: (l: Layers) => Layers) => void; excludedCount: number }) {
  const items: { key: keyof Layers; label: string; swatch: string }[] = [
    { key: "dine", label: "Restaurants", swatch: "bg-dine rounded-full" },
    { key: "free", label: "Free", swatch: "bg-ok rounded-sm" },
    { key: "paid", label: "Paid", swatch: "bg-ink rounded-sm" },
    { key: "unknown", label: "Fee unknown", swatch: "border-2 border-dashed border-ink bg-card rounded-sm" },
    { key: "excluded", label: `Not public (${excludedCount})`, swatch: "bg-muted-foreground/40 rounded-sm" },
  ];
  return (
    <div className="mt-2 rounded-xl border border-border bg-card px-3 py-2 text-[11px]" data-testid="legend">
      <div className="flex flex-wrap items-center gap-1.5">
        {items.map((it) => (
          <button
            key={it.key}
            type="button"
            aria-pressed={layers[it.key]}
            onClick={() => setLayers((l) => ({ ...l, [it.key]: !l[it.key] }))}
            className={cn("flex items-center gap-1.5 rounded-lg px-2 py-1 font-semibold transition", layers[it.key] ? "bg-muted text-foreground" : "text-muted-foreground line-through opacity-70")}
          >
            <span className={cn("h-2.5 w-2.5", it.swatch)} /> {it.label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-muted-foreground">
        Dot on a P = availability (green likely spaces · amber moderate · red busy), predicted. Green areas on the base map are parks from OpenStreetMap — not parking.
      </p>
    </div>
  );
}

function DataSources({ fetchedAt, places, routes }: { fetchedAt: string; places: string; routes: string | null }) {
  return (
    <details className="rounded-2xl border border-border bg-card p-3 text-xs" data-testid="data-sources">
      <summary className="flex cursor-pointer items-center gap-1.5 font-semibold"><Info className="h-3.5 w-3.5 text-primary" /> Data sources & availability methods</summary>
      <ul className="mt-2 space-y-1.5 text-muted-foreground">
        <li><span className="font-semibold text-foreground">Places & parking:</span> {places} · fetched {new Date(fetchedAt).toLocaleString("en-IN")}</li>
        <li><span className="font-semibold text-foreground">Walking distances:</span> {routes ?? "Unavailable — straight-line × 1.3 estimates, marked (est.)"}</li>
        <li><span className="font-semibold text-foreground">Ratings:</span> not available (OpenStreetMap has no ratings)</li>
        {PROVIDERS.map((p) => (
          <li key={p.id}>
            <span className="font-semibold text-foreground">{p.kind === "image-estimate" ? "Image estimate" : p.kind === "live" ? "Live" : "Predicted"}:</span>{" "}
            <span className={cn("rounded px-1 font-semibold", p.status === "operational" ? "bg-ok/15 text-ok" : "bg-muted")}>{p.status.replace("-", " ")}</span> — {p.description}
          </li>
        ))}
      </ul>
    </details>
  );
}


