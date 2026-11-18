import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, CalendarClock, Car, Check, Copy, Footprints, IndianRupee, Navigation, RotateCcw, Shield, Star, UtensilsCrossed } from "lucide-react";
import { AppShell, SimulatedNotice } from "@/components/AppShell";
import { MapView } from "@/components/MapView";
import { AccessBadge, AuthStatus, AvailabilityBadge, SafetyAttributes, SafetyBadge, Stat } from "@/components/parking-ui";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatTime, topRecommendations } from "@/lib/engine";
import { getWalkingRoute, getWalkMatrix } from "@/lib/route.functions";
import { SAFETY_BAND_LABEL, walkingRouteNote } from "@/lib/safety";
import { cleanSearch, criteriaSearchSchema, DEFAULT_SEARCH, suggestFixes, toCriteria } from "@/lib/search";
import { chargesText, directionsUrl, hoursText, PRICE_LABEL, walkingUrl } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";

const planSearchSchema = criteriaSearchSchema.extend({
  restaurant: fallback(z.string(), "").default(""),
  parking: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/plan")({
  validateSearch: zodValidator(planSearchSchema),
  loaderDeps: ({ search }) => ({ area: search.area }),
  loader: async ({ deps }) => ({ routes: await getWalkMatrix({ data: { area: deps.area } }).catch(() => null) }),
  staleTime: 10 * 60_000,
  head: () => ({
    meta: [
      { title: "Your parking plan — ParkWise GeoAI" },
      { name: "description", content: "Your restaurant, authorised parking, total estimated cost, safety indicators, walking distance and directions." },
      { property: "og:title", content: "Your restaurant & parking plan — ParkWise GeoAI" },
      { property: "og:description", content: "Authorised parking, estimated cost, safety indicators and walking distance for your chosen restaurant." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlanScreen,
});

function PlanScreen() {
  const raw = Route.useSearch();
  const { routes } = Route.useLoaderData();
  const search = cleanSearch(raw);
  const navigate = useNavigate({ from: "/plan" });
  const c = toCriteria(search);
  const rec = topRecommendations(c, 3, routes);
  const fixes = rec.top.length === 0 ? suggestFixes(search) : [];

  const eligible = rec.restaurants.filter((r) => r.eligible).sort((a, b) => b.best!.score - a.best!.score);
  const chosen = rec.restaurants.find((r) => r.restaurant.id === raw.restaurant) ?? rec.top[0] ?? null;
  const option = chosen ? (chosen.options.find((o) => o.eligible && o.park.parking.id === raw.parking) ?? chosen.best) : null;
  const eligibleOptions = chosen ? chosen.options.filter((o) => o.eligible) : [];

  const pick = (restaurant: string, parking = "") =>
    navigate({ search: (prev) => ({ ...prev, restaurant, parking }), replace: true, resetScroll: false });

  const fetchRoute = useServerFn(getWalkingRoute);
  const routeQ = useQuery({
    queryKey: ["walk-route", option?.park.parking.id, chosen?.restaurant.id],
    queryFn: () => fetchRoute({ data: { parkingId: option!.park.parking.id, restaurantId: chosen!.restaurant.id } }),
    enabled: !!option && !!chosen,
    staleTime: Infinity,
    retry: false,
  });
  const walkRoute = routeQ.data ?? null;
  const walkM = option ? (walkRoute?.distanceM ?? option.walkM) : 0;
  const walkIsRoute = !!walkRoute || option?.walkSource === "route";
  const walkMinutes = Math.max(1, Math.round(walkM / 75));
  // Arrival = when you reach the parking (availability is predicted for that moment).
  const seatedAt = (c.arrival + (option ? option.park.searchMin + walkMinutes : 0)) % 1440;

  const copyPlan = async () => {
    if (!chosen || !option) return;
    const p = option.park.parking;
    const text = [
      `ParkWise plan — ${chosen.restaurant.name}, ${rec.area.name}`,
      `Park: ${p.name} (${p.access.toUpperCase()}, ${p.authorisation === "shared-permission" ? "owner permission" : "authorised"} · ${p.operator})`,
      ...(p.note ? [`Entry: ${p.note}`] : []),
      `Reach parking ${formatTime(c.arrival)} (${c.day}, ${c.hours} h) · seated ~${formatTime(seatedAt)}`,
      `Cost: ${option.park.cost === 0 ? "FREE" : `₹${option.park.cost}`} · Availability ${option.park.availabilityPct}% (simulated) · Safety ${option.park.safety.score}/100 (synthetic)`,
      `Walk: ${walkM} m ${walkIsRoute ? "(OSM route)" : "(estimate)"}`,
      `Drive: ${directionsUrl(p.lat, p.lng)}`,
      `Walk: ${walkingUrl(p, chosen.restaurant)}`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Plan copied");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) toast.success("Plan copied");
      else toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  };

  return (
    <AppShell search={search}>
      <div className="mx-auto max-w-6xl px-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-extrabold sm:text-3xl">Your plan</h1>
          <Button asChild variant="ghost" size="sm">
            <Link to="/explore" search={search}><ArrowLeft /> Back to Explore</Link>
          </Button>
        </div>

        {rec.top.length > 0 && (
          <Select value={chosen?.restaurant.id ?? ""} onValueChange={(v) => pick(v)}>
            <SelectTrigger aria-label="Restaurant" className="mt-3 h-11 max-w-xl">
              <UtensilsCrossed className="h-4 w-4 text-dine" />
              <SelectValue placeholder="Select a restaurant" />
            </SelectTrigger>
            <SelectContent>
              {eligible.map((r) => (
                <SelectItem key={r.restaurant.id} value={r.restaurant.id}>
                  {r.restaurant.name} — score {r.best!.score}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {!chosen || !option ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-testid="empty-state">
            No restaurant has authorised parking within your filters.{" "}
            <Link to="/" search={search} className="font-semibold text-primary">Adjust your search</Link>.
            {fixes.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {fixes.map((f) => (
                  <Button key={f.label} size="sm" onClick={() => navigate({ search: (prev) => ({ ...prev, ...cleanSearch({ ...prev, ...f.patch }), restaurant: "", parking: "" }), replace: true })}>
                    {f.label} <span className="font-normal opacity-80">· {f.results} fit</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
            <section className="self-start overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-float)]">
              <div className="bg-ink p-5 text-ink-foreground">
                <div className="text-xs text-ink-foreground/70">
                  <span className="font-semibold">{chosen.restaurant.name}</span> · {chosen.restaurant.cuisine} · {PRICE_LABEL[chosen.restaurant.price]} · <Star className="inline h-3 w-3 fill-signal text-signal" /> {chosen.restaurant.rating}
                </div>
                <h2 className="mt-2 text-2xl font-extrabold leading-tight">{option.park.parking.name}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <AccessBadge access={option.park.parking.access} />
                  <AuthStatus authorisation={option.park.parking.authorisation} operator={option.park.parking.operator} className="text-ok" />
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat icon={IndianRupee} label="Total cost" value={option.park.cost === 0 ? "FREE" : `₹${option.park.cost}`} sub={`${c.hours} h · illustrative`} />
                  <Stat icon={Car} label="Availability" value={`${option.park.availabilityPct}%`} sub={`~${option.park.freeSpots} spots · simulated`} />
                  <Stat icon={Shield} label="Safety" value={`${option.park.safety.score}/100`} sub={SAFETY_BAND_LABEL[option.park.safety.band].replace(" safety indicators", "")} />
                  <Stat
                    icon={Footprints}
                    label="Walk"
                    value={`${walkM} m`}
                    sub={routeQ.isLoading ? "Fetching route…" : `${walkIsRoute ? "OSM route" : "Estimate"} · ${option.straightM} m straight`}
                  />
                </div>
                <SafetyAttributes safety={option.park.safety} className="mt-3" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Facility indicators are synthetic. Walking route: {walkingRouteNote(walkM, c.arrival, c.hours).text}.
                </p>

                <div className="mt-3 flex items-center gap-2 rounded-xl bg-accent/70 p-3 text-sm text-accent-foreground">
                  <CalendarClock className="h-4 w-4 shrink-0" />
                  <span>
                    Reach parking <strong>{formatTime(c.arrival)}</strong> → seated ~<strong>{formatTime(seatedAt)}</strong> ({option.park.searchMin} min to park + {walkMinutes} min walk)
                  </span>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button asChild variant="signal" size="lg">
                    <a href={directionsUrl(option.park.parking.lat, option.park.parking.lng)} target="_blank" rel="noopener noreferrer"><Navigation /> Directions to parking</a>
                  </Button>
                  <Button variant="outline" size="lg" onClick={copyPlan}><Copy /> Copy plan</Button>
                </div>
                <a href={walkingUrl(option.park.parking, chosen.restaurant)} target="_blank" rel="noopener noreferrer" className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-primary hover:underline">
                  <Footprints className="h-4 w-4" /> Walking directions to {chosen.restaurant.name}
                </a>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  {option.park.parking.access === "free" ? "Free (₹0)" : chargesText(option.park.parking)} · open {hoursText(option.park.parking)}
                  {option.park.parking.note ? ` · ${option.park.parking.note}` : ""}
                </p>
              </div>
            </section>

            <div className="flex flex-col gap-4">
              <MapView
                center={[chosen.restaurant.lat, chosen.restaurant.lng]}
                zoom={17}
                fitKey={`${chosen.restaurant.id}-${option.park.parking.id}`}
                restaurants={[{ id: chosen.restaurant.id, name: chosen.restaurant.name, lat: chosen.restaurant.lat, lng: chosen.restaurant.lng }]}
                parkings={eligibleOptions.map((o) => ({
                  id: o.park.parking.id,
                  name: o.park.parking.name,
                  lat: o.park.parking.lat,
                  lng: o.park.parking.lng,
                  status: o.park.status,
                  variant: o.park.parking.access,
                }))}
                selectedRestaurantId={chosen.restaurant.id}
                selectedParkingId={option.park.parking.id}
                onSelectParking={(id) => void pick(chosen.restaurant.id, id)}
                route={walkRoute?.coords ?? [[option.park.parking.lat, option.park.parking.lng], [chosen.restaurant.lat, chosen.restaurant.lng]]}
                showPopups={false}
                className="h-72 w-full overflow-hidden rounded-2xl border border-border lg:h-80"
              />
              {eligibleOptions.length > 1 && (
                <div className="rounded-2xl border border-border bg-card p-3">
                  <h3 className="text-sm font-bold">Switch parking</h3>
                  <ul className="mt-2 space-y-1.5" role="radiogroup" aria-label="Parking options">
                    {eligibleOptions.map((o) => {
                      const active = o === option;
                      return (
                        <li key={o.park.parking.id}>
                          <button
                            type="button"
                            role="radio"
                            aria-checked={active}
                            onClick={() => pick(chosen.restaurant.id, o.park.parking.id)}
                            className={cn("flex w-full items-center justify-between gap-2 rounded-xl border p-2 text-left", active ? "border-primary bg-accent/50" : "border-border hover:border-primary/50")}
                          >
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="truncate text-sm font-semibold">{o.park.parking.name}</span>
                                {o === chosen.best && <span className="rounded-full bg-gradient-signal px-1.5 py-0.5 text-[10px] font-bold text-signal-foreground">Best</span>}
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                <AccessBadge access={o.park.parking.access} />
                                <span>{o.park.cost === 0 ? "₹0" : `₹${o.park.cost}`}</span>
                                <AvailabilityBadge status={o.park.status} pct={o.park.availabilityPct} />
                                <span>{o.walkM} m</span>
                                <SafetyBadge safety={o.park.safety} />
                                <span>score {o.score}</span>
                              </div>
                            </div>
                            <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", active ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                              {active && <Check className="h-3 w-3" />}
                            </span>
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

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SimulatedNotice className="sm:max-w-xl" />
          <Button asChild variant="ghost"><Link to="/" search={DEFAULT_SEARCH}><RotateCcw /> New search</Link></Button>
        </div>
      </div>
    </AppShell>
  );
}
