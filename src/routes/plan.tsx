import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWalkingRoute } from "@/lib/route.functions";
import { ArrowRight, CalendarClock, Car, Check, Copy, Footprints, IndianRupee, Navigation, RotateCcw, ShieldCheck, Sparkles, Star, Timer, UtensilsCrossed } from "lucide-react";
import { AppShell, SimulatedNotice } from "@/components/AppShell";
import { MapView } from "@/components/MapView";
import { AccessBadge, AvailabilityBadge, CriteriaBar, Stat } from "@/components/parking-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatTime, topRecommendations } from "@/lib/engine";
import { cleanSearch, criteriaSearchSchema, DEFAULT_SEARCH, suggestFixes, toCriteria } from "@/lib/search";
import { chargesText, directionsUrl, hoursText, PRICE_LABEL, walkingUrl } from "@/lib/ui-helpers";
import { cn } from "@/lib/utils";

const planSearchSchema = criteriaSearchSchema.extend({
  restaurant: fallback(z.string(), "").default(""),
  parking: fallback(z.string(), "").default(""),
});

export const Route = createFileRoute("/plan")({
  validateSearch: zodValidator(planSearchSchema),
  head: () => ({
    meta: [
      { title: "Your parking plan — ParkWise GeoAI" },
      { name: "description", content: "Pick a restaurant and see the recommended authorised parking facility, estimated cost and walking distance." },
      { property: "og:title", content: "Your restaurant & parking plan — ParkWise GeoAI" },
      { property: "og:description", content: "Recommended authorised parking, estimated cost and walking distance for your chosen restaurant." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PlanScreen,
});

function PlanScreen() {
  const raw = Route.useSearch();
  const search = cleanSearch(raw);
  const navigate = useNavigate({ from: "/plan" });
  const c = toCriteria(search);
  const rec = topRecommendations(c, 3);
  const fixes = rec.top.length === 0 ? suggestFixes(search) : [];

  const eligible = rec.restaurants.filter((r) => r.eligible).sort((a, b) => b.best!.score - a.best!.score);
  const others = rec.restaurants.filter((r) => !r.eligible);
  const chosen =
    rec.restaurants.find((r) => r.restaurant.id === raw.restaurant) ?? rec.top[0] ?? null;
  const option = chosen
    ? (chosen.options.find((o) => o.eligible && o.park.parking.id === raw.parking) ?? chosen.best)
    : null;
  const alternatives = chosen ? chosen.options.filter((o) => o.eligible && o !== option) : [];
  const isTop = chosen && rec.top[0]?.restaurant.id === chosen.restaurant.id;

  const pick = (restaurant: string, parking = "") =>
    navigate({ search: (prev) => ({ ...prev, restaurant, parking }), replace: true, resetScroll: false });

  const fetchRoute = useServerFn(getWalkingRoute);
  const routeQ = useQuery({
    queryKey: ["walk-route", option?.park.parking.id, chosen?.restaurant.id],
    queryFn: () =>
      fetchRoute({ data: { parkingId: option!.park.parking.id, restaurantId: chosen!.restaurant.id } }),
    enabled: !!option && !!chosen,
    staleTime: Infinity,
    retry: false,
  });
  const walkRoute = routeQ.data ?? null;
  const walkMinutes = walkRoute ? walkRoute.durationMin : (option?.walkMin ?? 0);
  // Arrival = when you reach the parking (availability is predicted for that moment).
  const seatedAt = (c.arrival + (option ? option.park.searchMin + walkMinutes : 0)) % 1440;

  const copyPlan = async () => {
    if (!chosen || !option) return;
    const text = [
      `ParkWise GeoAI plan — ${rec.area.name}`,
      `Restaurant: ${chosen.restaurant.name} (${chosen.restaurant.cuisine})`,
      `Park at: ${option.park.parking.name} (${option.park.parking.authorisation === "shared-permission" ? "shared, owner permission" : "authorised"}, ${option.park.parking.operator})`,
      ...(option.park.parking.note ? [`Entry: ${option.park.parking.note}`] : []),
      `Reach parking: ${formatTime(c.arrival)} · ${c.day} · ${c.hours} h stay · seated ~${formatTime(seatedAt)}`,
      `Est. parking cost: ${option.park.cost === 0 ? "FREE (₹0)" : `₹${option.park.cost} (illustrative)`} · ${option.park.parking.access.toUpperCase()}`,
      `Walk: ${walkRoute ? `${walkRoute.distanceM} m (OSM walking route)` : `~${option.walkM} m (estimate)`}, ${option.straightM} m straight line`,
      `Simulated availability: ${option.park.availabilityPct}% · ~${option.park.searchMin} min to find a spot`,
      `Drive to parking: ${directionsUrl(option.park.parking.lat, option.park.parking.lng)}`,
      `Walk to restaurant: ${walkingUrl(option.park.parking, chosen.restaurant)}`,
      `Note: availability is simulated, not live.`,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Plan copied to clipboard");
    } catch {
      // Fallback for browsers/iframes that block the async clipboard API
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (ok) toast.success("Plan copied to clipboard");
      else toast.error("Couldn't copy — your browser blocked clipboard access");
    }
  };

  return (
    <AppShell search={search}>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <Check className="h-4 w-4" /> Step 4 · Your plan
        </span>
        <h1 className="mt-1 text-2xl font-extrabold sm:text-3xl">Choose a restaurant, we'll handle the parking</h1>
        <div className="mt-3"><CriteriaBar search={search} /></div>

        <div className="mt-5 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
          <Label htmlFor="restaurant" className="flex items-center gap-1.5"><UtensilsCrossed className="h-4 w-4 text-dine" /> Restaurant</Label>
          <Select value={chosen?.restaurant.id ?? ""} onValueChange={(v) => pick(v)}>
            <SelectTrigger id="restaurant" className="mt-2 h-12 text-base"><SelectValue placeholder="Select a restaurant" /></SelectTrigger>
            <SelectContent>
              {eligible.map((r) => (
                <SelectItem key={r.restaurant.id} value={r.restaurant.id}>
                  {r.restaurant.name} — score {r.best!.score}
                </SelectItem>
              ))}
              {others.map((r) => (
                <SelectItem key={r.restaurant.id} value={r.restaurant.id}>
                  {r.restaurant.name} — no parking within limits
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {rec.top.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">AI top picks:</span>
              {rec.top.map((r, i) => (
                <button
                  key={r.restaurant.id}
                  onClick={() => pick(r.restaurant.id)}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-medium transition",
                    chosen?.restaurant.id === r.restaurant.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-accent",
                  )}
                >
                  #{i + 1} {r.restaurant.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {!chosen ? (
          <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No restaurants have authorised parking within your limits. <Link to="/" search={search} className="font-semibold text-primary">Adjust your search</Link>.
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
        ) : !option ? (
          <div className="mt-6 rounded-2xl border border-busy/30 bg-busy/10 p-6 text-sm">
            <h2 className="text-lg font-bold">No authorised parking fits for {chosen.restaurant.name}</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              {chosen.options.slice(0, 3).map((o) => (
                <li key={o.park.parking.id}>{o.park.parking.name}: {o.issues.join("; ")}</li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" onClick={() => navigate({ search: (prev) => ({ ...prev, budget: Math.min(400, prev.budget + 100) }), replace: true })}>Raise budget by ₹100</Button>
              <Button size="sm" variant="outline" onClick={() => navigate({ search: (prev) => ({ ...prev, walk: Math.min(1500, prev.walk + 300) }), replace: true })}>Allow 300 m more walking</Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
            <section className="self-start overflow-hidden rounded-3xl border border-border bg-card shadow-[var(--shadow-float)]">
              <div className="bg-ink p-5 text-ink-foreground">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-ink-foreground/60">
                      {option === chosen.best ? "Recommended parking" : "Your selected parking"}
                    </div>
                    <h2 className="mt-1 text-2xl font-extrabold leading-tight">{option.park.parking.name}</h2>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-foreground/75">
                      <AccessBadge access={option.park.parking.access} />
                      <ShieldCheck className="h-3.5 w-3.5 text-ok" /> {option.park.parking.authorisation === "shared-permission" ? "Shared · owner permission verified" : "Verified authorised"} · {option.park.parking.operator} · {option.park.parking.kind}
                    </div>
                  </div>
                  <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-signal font-display text-3xl font-extrabold text-signal-foreground">P</span>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <ArrowRight className="h-4 w-4 text-signal" /> Walk to <strong>{chosen.restaurant.name}</strong>
                  <span className="text-ink-foreground/60">· {chosen.restaurant.cuisine} · {PRICE_LABEL[chosen.restaurant.price]} · <Star className="inline h-3 w-3 fill-signal text-signal" /> {chosen.restaurant.rating}</span>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat icon={IndianRupee} label="Estimated cost" value={option.park.cost === 0 ? "FREE" : `₹${option.park.cost}`} sub={option.park.cost === 0 ? "₹0 · verified free" : `${c.hours} h · illustrative tariff`} />
                  <Stat
                    icon={Footprints}
                    label={walkRoute ? "Walking route" : "Walking (est.)"}
                    value={walkRoute ? `${walkRoute.distanceM} m` : `~${option.walkM} m`}
                    sub={routeQ.isLoading ? "Fetching route…" : walkRoute ? `OSM route · ${option.straightM} m straight` : `Estimate · ${option.straightM} m straight`}
                  />
                  <Stat icon={Car} label="Availability" value={`${option.park.availabilityPct}%`} sub={`~${option.park.freeSpots} spots (simulated)`} />
                  <Stat icon={Timer} label="Search time" value={`~${option.park.searchMin} min`} sub="expected" />
                </div>
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-accent/70 p-3 text-sm text-accent-foreground">
                  <CalendarClock className="h-4 w-4 shrink-0" />
                  <span>
                    Reach the parking at <strong>{formatTime(c.arrival)}</strong> and expect to be seated by about <strong>{formatTime(seatedAt)}</strong> (~{option.park.searchMin} min to park + ~{walkMinutes} min walk).
                  </span>
                </div>
                {option !== chosen.best && chosen.best && (
                  <button className="mt-3 text-xs font-semibold text-primary hover:underline" onClick={() => pick(chosen.restaurant.id)}>
                    ← Switch back to recommended: {chosen.best.park.parking.name} (score {chosen.best.score} vs {option.score})
                  </button>
                )}
                {isTop && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground"><Sparkles className="h-3.5 w-3.5 text-signal" /> This is ParkWise's #1 AI pick for your trip.</p>
                )}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <Button asChild variant="signal" size="lg">
                    <a href={directionsUrl(option.park.parking.lat, option.park.parking.lng)} target="_blank" rel="noopener noreferrer">
                      <Navigation /> Directions to parking
                    </a>
                  </Button>
                  <Button variant="outline" size="lg" onClick={copyPlan}><Copy /> Copy plan</Button>
                </div>
                <a
                  href={walkingUrl(option.park.parking, chosen.restaurant)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 flex items-center justify-center gap-1.5 text-sm font-semibold text-primary hover:underline"
                >
                  <Footprints className="h-4 w-4" /> Walking route from parking to {chosen.restaurant.name}
                </a>
                <p className="mt-3 text-xs text-muted-foreground">
                  Charges: {option.park.parking.access === "free" ? "free (₹0)" : `${chargesText(option.park.parking)} (illustrative)`} · Open {hoursText(option.park.parking)} · Capacity {option.park.parking.capacity} spots
                </p>
              </div>
            </section>

            <div className="flex flex-col gap-4">
              <MapView
                center={[chosen.restaurant.lat, chosen.restaurant.lng]}
                zoom={17}
                fitKey={`${chosen.restaurant.id}-${option.park.parking.id}`}
                restaurants={[{
                  id: chosen.restaurant.id,
                  name: chosen.restaurant.name,
                  lat: chosen.restaurant.lat,
                  lng: chosen.restaurant.lng,
                  popupLines: [`${chosen.restaurant.cuisine} · ${PRICE_LABEL[chosen.restaurant.price]} · ★ ${chosen.restaurant.rating}`, chosen.restaurant.blurb],
                }]}
                parkings={[option, ...alternatives].map((o) => ({
                  id: o.park.parking.id,
                  name: o.park.parking.name,
                  lat: o.park.parking.lat,
                  lng: o.park.parking.lng,
                  status: o.park.status,
                  popupLines: [
                    `${o.park.parking.authorisation === "shared-permission" ? "✓ Shared with verified owner permission" : "✓ Verified authorised"} · ${o.park.parking.operator}`,
                    `Simulated availability: ${o.park.availabilityPct}% (~${o.park.freeSpots} of ${o.park.parking.capacity} spots)`,
                    `₹${o.park.cost} for ${c.hours} h · ${o.walkM} m walk · ~${o.park.searchMin} min search`,
                  ],
                }))}
                selectedRestaurantId={chosen.restaurant.id}
                selectedParkingId={option.park.parking.id}
                onSelectParking={(id) => void pick(chosen.restaurant.id, id)}
                route={walkRoute?.coords ?? [[option.park.parking.lat, option.park.parking.lng], [chosen.restaurant.lat, chosen.restaurant.lng]]}
                className="h-72 w-full overflow-hidden rounded-2xl border border-border lg:h-80"
              />
              <div className="rounded-2xl border border-border bg-card p-4">
                <h3 className="text-sm font-bold">Authorised parking for {chosen.restaurant.name}</h3>
                <p className="text-xs text-muted-foreground">Tap an option (or a P on the map) to switch. Availability is simulated.</p>
                <ul className="mt-3 space-y-2" role="radiogroup" aria-label="Parking options">
                  {chosen.options.map((o) => {
                    const active = o === option;
                    const isBest = o === chosen.best;
                    return (
                      <li key={o.park.parking.id}>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={!o.eligible}
                          onClick={() => pick(chosen.restaurant.id, o.park.parking.id)}
                          className={cn(
                            "flex w-full items-center justify-between gap-2 rounded-xl border p-2.5 text-left transition",
                            active ? "border-primary bg-accent/50 ring-2 ring-primary/20" : "border-border hover:border-primary/50",
                            !o.eligible && "cursor-not-allowed opacity-55 hover:border-border",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="truncate text-sm font-semibold">{o.park.parking.name}</span>
                              {isBest && <span className="rounded-full bg-gradient-signal px-1.5 py-0.5 text-[10px] font-bold text-signal-foreground">Recommended</span>}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                              <AvailabilityBadge status={o.park.status} pct={o.park.availabilityPct} />
                              <AccessBadge access={o.park.parking.access} /><span>{o.park.cost === 0 ? "₹0" : `₹${o.park.cost}`}</span><span>~{o.walkM} m ({o.straightM} m straight)</span>
                              {o.eligible ? <span>score {o.score}</span> : <span className="text-busy">{o.issues[0]}</span>}
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
                {alternatives.length === 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">No other authorised facility fits your budget and walking limit.</p>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SimulatedNotice className="sm:max-w-xl" />
          <div className="flex gap-2">
            <Button asChild variant="outline"><Link to="/recommendations" search={search}><Sparkles /> AI picks</Link></Button>
            <Button asChild variant="ghost"><Link to="/" search={DEFAULT_SEARCH}><RotateCcw /> New search</Link></Button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
