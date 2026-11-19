import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarClock, Car, Check, Clock, Copy, ExternalLink, Footprints, IndianRupee, Loader2, Navigation, ParkingSquare, RefreshCw } from "lucide-react";
import { AppShell, SimulatedNotice } from "@/components/AppShell";
import { MapView } from "@/components/MapView";
import { AvailabilityTag, CategoryBadge, FacilityFacts, OptionTags, parkingName, Stat } from "@/components/parking-ui";
import { Button } from "@/components/ui/button";
import { evaluate, formatTime } from "@/lib/engine";
import { usePlaceData } from "@/lib/places/usePlaceData";
import { getWalkingRoute } from "@/lib/route.functions";
import { cleanSearch, criteriaSearchSchema, hasDestination, toCriteria, type CleanSearch } from "@/lib/search";
import { directionsUrl, formatDate, walkingUrl } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";

const planSearchSchema = criteriaSearchSchema.extend({
  restaurant: fallback(z.string(), "").default(""),
  parking: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/plan")({
  validateSearch: zodValidator(planSearchSchema),
  beforeLoad: ({ search }) => {
    if (!hasDestination(cleanSearch(search))) throw redirect({ to: "/", search: cleanSearch(search) });
  },
  head: () => ({
    meta: [
      { title: "Your plan — ParkWise" },
      { name: "description", content: "Your restaurant, the parking to use, estimated charges, availability and walking directions." },
      { property: "og:title", content: "Your restaurant & parking plan — ParkWise" },
      { property: "og:description", content: "Restaurant, parking, charges and walking directions." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PlanScreen,
});

function PlanScreen() {
  const raw = Route.useSearch();
  const search = cleanSearch(raw) as CleanSearch & { lat: number; lng: number };
  const navigate = useNavigate({ from: "/plan" });
  const c = toCriteria(search);
  const places = usePlaceData(search.lat, search.lng);
  const data = places.data && !places.data.error ? places.data : null;
  const ev = data ? evaluate(data, c) : null;
  const chosen = ev ? (ev.restaurants.find((r) => r.restaurant.id === raw.restaurant) ?? ev.top[0] ?? null) : null;
  const option = chosen ? (chosen.options.find((o) => o.eligible && o.parking.id === raw.parking) ?? chosen.best) : null;
  const eligible = chosen ? chosen.options.filter((o) => o.eligible) : [];
  const pick = (parking: string) => navigate({ search: (prev) => ({ ...prev, parking }), replace: true, resetScroll: false });

  const fetchRoute = useServerFn(getWalkingRoute);
  const routeQ = useQuery({
    queryKey: ["walk-route", option?.parking.id, chosen?.restaurant.id],
    queryFn: () => fetchRoute({ data: { lat: search.lat, lng: search.lng, parkingId: option!.parking.id, restaurantId: chosen!.restaurant.id } }),
    enabled: !!option && !!chosen,
    staleTime: Infinity,
    retry: false,
  });
  const walkRoute = routeQ.data ?? null;
  const walkM = option ? Math.max(option.straightM, walkRoute?.distanceM ?? option.walkM) : 0;
  const walkMin = Math.max(1, Math.round(walkM / 75));
  const walkSource = walkRoute ? "OpenStreetMap walking route" : option?.walkSource === "route" ? "OpenStreetMap walking distance" : "Estimate (straight line × 1.3)";

  const copyPlan = async () => {
    if (!chosen || !option) return;
    const p = option.parking;
    const text = [
      `ParkWise plan — ${chosen.restaurant.name}`,
      `${formatDate(c.dateISO)}, reach parking ${formatTime(c.arrival)}, ${c.hours} h`,
      `Park: ${parkingName(p)} (${p.category === "free" ? "free" : p.category === "paid" ? "paid" : "fee unknown"})`,
      `Cost: ${option.cost === 0 ? "₹0" : option.cost !== null ? `₹${option.cost}` : option.costLabel}`,
      `Walk: ${walkM} m (${walkSource})`,
      `Availability: ${option.availability.kind === "unknown" ? "unknown" : `${option.availability.label} (${option.availability.kind}${option.availability.simulated ? ", simulated" : ""})`}`,
      `Drive: ${directionsUrl(p.lat, p.lng)}`,
      `Walk: ${walkingUrl(p, chosen.restaurant)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Plan copied");
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  };

  return (
    <AppShell search={search}>
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-extrabold sm:text-3xl">
            Your plan
            {data?.demo && <span className="rounded bg-signal px-2 py-0.5 text-xs font-bold text-signal-foreground" data-testid="demo-badge">DEMO DATA</span>}
          </h1>
          <Button asChild variant="ghost" size="sm">
            <Link to="/explore" search={search}><ArrowLeft /> Back to Explore</Link>
          </Button>
        </div>

        {places.isLoading && (
          <div className="mt-6 rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" /> Loading map data…</div>
        )}
        {(places.isError || places.data?.error) && (
          <div className="mt-6 rounded-2xl border border-busy/30 bg-busy/5 p-6 text-center text-sm" data-testid="data-error">
            <p className="font-semibold">Couldn't load map data</p>
            <p className="mt-1 text-muted-foreground">{places.data?.error ?? "The place data service didn't respond."}</p>
            <Button size="sm" className="mt-3" onClick={() => places.refetch()}><RefreshCw /> Try again</Button>
          </div>
        )}

        {data && (!chosen || !option) && (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-testid="empty-state">
            {chosen ? `${chosen.restaurant.name}: ${chosen.reason}.` : "No restaurant has parking that fits your filters."}{" "}
            <Link to="/explore" search={search} className="font-semibold text-primary">Change filters in Explore</Link>.
          </div>
        )}

        {chosen && option && (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <section className="self-start overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-float)]">
              <div className="bg-ink p-5 text-ink-foreground">
                <div className="text-xs text-ink-foreground/70">Restaurant</div>
                <h2 className="text-xl font-extrabold leading-tight">{chosen.restaurant.name}</h2>
                <p className="mt-1 text-xs text-ink-foreground/75">
                  {[chosen.restaurant.cuisine, chosen.restaurant.address].filter(Boolean).join(" · ") || "Cuisine and address not recorded"}
                </p>
                <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-ink-foreground/75">
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{chosen.restaurant.openingHours ?? "Hours unknown"}</span>
                  <span>Rating: not available</span>
                  {chosen.restaurant.website && (
                    <a href={chosen.restaurant.website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline">
                      Website <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </p>
                <div className="mt-4 text-xs text-ink-foreground/70">Park at</div>
                <h3 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold leading-tight">
                  {parkingName(option.parking)} <CategoryBadge category={option.parking.category} />
                </h3>
                <div className="mt-1"><OptionTags tags={option.tags} /></div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat icon={IndianRupee} label="Estimated charge" value={option.cost === 0 ? "₹0" : option.cost !== null ? `₹${option.cost}` : "Unknown"} sub={option.cost === null ? option.costLabel : `${c.hours} h · ${option.costLabel}`} />
                  <Stat icon={Car} label="Availability" value={option.availability.kind === "unknown" ? "Unknown" : option.availability.label} sub={option.availability.kind === "predicted" ? "Predicted · simulated history" : option.availability.source} />
                  <Stat icon={Footprints} label="Walk" value={`${walkM} m`} sub={routeQ.isLoading ? "Fetching route…" : `~${walkMin} min · ${walkSource}`} />
                  <Stat
                    icon={ParkingSquare}
                    label="Capacity"
                    value={option.parking.capacity ? `~${option.parking.capacity.value}` : "Unknown"}
                    sub={option.parking.capacity ? (option.parking.capacity.source === "osm-tag" ? "As recorded on the map" : "Estimated from mapped lot area") : "Not recorded"}
                  />
                </div>
                <div className="mt-3 space-y-1 text-xs">
                  <AvailabilityTag a={option.availability} demo={!!data?.demo} />
                  <FacilityFacts p={option.parking} />
                  <p className="text-muted-foreground">
                    Hours: {option.parking.openingHours ?? "unknown"} · Operator: {option.parking.operator ?? "unknown"}
                    {option.parking.url ? (
                      <>
                        {" · "}
                        <a href={option.parking.url} target="_blank" rel="noopener noreferrer" className="underline">source record</a>
                      </>
                    ) : (
                      " · DEMO DATA (fictional)"
                    )}
                  </p>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-xl bg-accent/70 p-3 text-sm text-accent-foreground">
                  <CalendarClock className="h-4 w-4 shrink-0" />
                  <span>
                    {formatDate(c.dateISO)}: reach the parking at <strong>{formatTime(c.arrival)}</strong>, then a ~{walkMin} min walk.
                  </span>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button asChild variant="signal" size="lg">
                    <a href={directionsUrl(option.parking.lat, option.parking.lng)} target="_blank" rel="noopener noreferrer"><Navigation /> Directions to parking</a>
                  </Button>
                  <Button variant="outline" size="lg" onClick={copyPlan}><Copy /> Copy plan</Button>
                </div>
                <a href={walkingUrl(option.parking, chosen.restaurant)} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                  <Footprints className="h-4 w-4" /> Walking directions to {chosen.restaurant.name}
                </a>
              </div>
            </section>

            <div className="flex flex-col gap-4">
              <MapView
                center={[chosen.restaurant.lat, chosen.restaurant.lng]}
                zoom={17}
                fitKey={`${chosen.restaurant.id}-${option.parking.id}`}
                restaurants={[{ id: chosen.restaurant.id, name: chosen.restaurant.name, lat: chosen.restaurant.lat, lng: chosen.restaurant.lng }]}
                parkings={eligible.map((o) => ({ id: o.parking.id, name: parkingName(o.parking), lat: o.parking.lat, lng: o.parking.lng, variant: o.parking.category, level: o.availability.level }))}
                selectedRestaurantId={chosen.restaurant.id}
                selectedParkingId={option.parking.id}
                onSelectParking={pick}
                route={walkRoute?.coords ?? null}
                className="h-72 w-full overflow-hidden rounded-2xl border border-border lg:h-80"
              />
              {eligible.length > 1 && (
                <div className="rounded-2xl border border-border bg-card p-3">
                  <h3 className="text-sm font-bold">Other parking that fits</h3>
                  <ul className="mt-2 space-y-1.5" role="radiogroup" aria-label="Parking options">
                    {eligible.slice(0, 8).map((o) => {
                      const active = o === option;
                      return (
                        <li key={o.parking.id}>
                          <button type="button" role="radio" aria-checked={active} onClick={() => pick(o.parking.id)} className={cn("flex w-full items-center justify-between gap-2 rounded-xl border p-2 text-left", active ? "border-primary bg-accent/50" : "border-border hover:border-primary/50")}>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <CategoryBadge category={o.parking.category} />
                                <span className="truncate text-sm font-semibold">{parkingName(o.parking)}</span>
                                <OptionTags tags={o.tags} />
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                <span>{o.cost === 0 ? "Free" : o.cost !== null ? `₹${o.cost}` : "Price unknown"}</span>
                                <span>{o.walkM} m{o.walkSource === "estimate" ? " (est.)" : ""}</span>
                                <AvailabilityTag a={o.availability} demo={!!data?.demo} />
                              </div>
                            </div>
                            <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", active ? "border-primary bg-primary text-primary-foreground" : "border-border")}>{active && <Check className="h-3 w-3" />}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        <SimulatedNotice className="mt-6" />
      </div>
    </AppShell>
  );
}
