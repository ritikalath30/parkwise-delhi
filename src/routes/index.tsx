import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useState } from "react";
import { ArrowRight, Car, Footprints, MapPinned, Route as RouteIcon } from "lucide-react";
import heroImg from "@/assets/hauz-khas-dusk.jpg";
import { Logo, SiteFooter, StepNav } from "@/components/AppShell";
import { DestinationSearch } from "@/components/DestinationSearch";
import { TripAdjuster } from "@/components/TripAdjuster";
import { Button } from "@/components/ui/button";
import { DELHI_STATS } from "@/lib/places/delhi-stats";
import { cleanSearch, criteriaSearchSchema, hasDestination, type CleanSearch } from "@/lib/search";

export const Route = createFileRoute("/")({
  validateSearch: zodValidator(criteriaSearchSchema),
  head: () => ({
    meta: [
      { title: "ParkWise — Restaurants with legal parking nearby" },
      { name: "description", content: "Search any destination to find restaurants and nearby public parking that fits your budget, time and walking distance." },
      { property: "og:title", content: "ParkWise — Restaurants with legal parking nearby" },
      { property: "og:description", content: "Find restaurants and nearby public parking that fits your budget, time and walking distance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SearchScreen,
});

function SearchScreen() {
  const navigate = useNavigate();
  const initial = Route.useSearch();
  const [form, setForm] = useState<CleanSearch>(() => cleanSearch(initial));
  const ready = hasDestination(form);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <section className="relative isolate overflow-hidden bg-ink">
        <img src={heroImg} alt="" aria-hidden width={1600} height={1008} className="absolute inset-0 -z-10 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-ink/70 via-ink/80 to-ink" />
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <Logo light />
          <div className="rounded-full bg-background/90 p-1 backdrop-blur"><StepNav search={form} /></div>
        </header>

        <div className="mx-auto grid max-w-6xl gap-8 px-4 pb-16 pt-8 lg:grid-cols-[1fr_440px] lg:items-center lg:pb-24 lg:pt-14">
          <div className="text-ink-foreground">
            <span className="inline-flex rounded-full border border-ink-foreground/25 bg-ink-foreground/10 px-3 py-1 text-xs font-semibold">Delhi · {DELHI_STATS.restaurants.toLocaleString("en-IN")} restaurants · {DELHI_STATS.parking} car parks mapped</span>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] sm:text-5xl">
              Dinner plans, <span className="text-signal">sorted</span> —<br className="hidden sm:block" /> parking included.
            </h1>
            <p className="mt-4 max-w-md text-base text-ink-foreground/80 sm:text-lg">
              Pick where you're headed. ParkWise finds restaurants nearby and the public car parks that fit your budget and how far you're willing to walk.
            </p>
            <ul className="mt-6 hidden space-y-2 text-sm text-ink-foreground/85 sm:block">
              <li className="flex items-center gap-2"><MapPinned className="h-4 w-4 text-signal" /> Real places from OpenStreetMap</li>
              <li className="flex items-center gap-2"><RouteIcon className="h-4 w-4 text-signal" /> Actual walking routes, not straight lines</li>
              <li className="flex items-center gap-2"><Car className="h-4 w-4 text-signal" /> Only public parking — never private lots</li>
            </ul>
          </div>

          <form
            className="space-y-4 rounded-2xl bg-card p-5 shadow-[var(--shadow-float)] sm:p-6"
            aria-label="Plan your visit"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) navigate({ to: "/explore", search: form });
            }}
          >
            <h2 className="text-lg font-bold">Where are you eating?</h2>
            <DestinationSearch
              value={form.q}
              autoFocus
              bias={{ lat: 28.6139, lng: 77.209 }}
              onSelect={(r) => setForm((f) => ({ ...f, q: r.detail ? `${r.label}, ${r.detail.split(", ").slice(0, 2).join(", ")}` : r.label, lat: r.lat, lng: r.lng }))}
            />
            <TripAdjuster search={form} onChange={(patch) => setForm((f) => cleanSearch({ ...f, ...patch }))} />
            <Button type="submit" variant="signal" size="xl" className="w-full" disabled={!ready}>
              {ready ? "Find restaurants & parking" : "Choose a destination to continue"} <ArrowRight />
            </Button>
          </form>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-4 py-12">
        <h2 className="text-center text-2xl font-extrabold">How it works</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {[
            { icon: MapPinned, t: "Search a place", d: "A neighbourhood, landmark, address or restaurant anywhere in Delhi." },
            { icon: Car, t: "Compare parking", d: "Free or paid, your budget, your walking limit — results update as you change them." },
            { icon: Footprints, t: "Get your plan", d: "Where to park, what it costs, how busy it's likely to be, and the walking route." },
          ].map((x, i) => (
            <div key={x.t} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent font-display font-extrabold text-accent-foreground">{i + 1}</span>
                <x.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="mt-3 font-bold">{x.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{x.d}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          Map data © OpenStreetMap contributors (snapshot {DELHI_STATS.snapshot}). Parking availability is predicted from simulated demand data — not live.
        </p>
      </section>
      <SiteFooter />
    </div>
  );
}
