import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { Logo, SiteFooter, StepNav } from "@/components/AppShell";
import { DestinationSearch } from "@/components/DestinationSearch";
import { TripAdjuster } from "@/components/TripAdjuster";
import { Button } from "@/components/ui/button";
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
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Logo />
          <StepNav search={form} />
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto max-w-2xl px-4 pb-16 pt-10 sm:pt-16">
          <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">Where are you eating?</h1>
          <p className="mt-2 text-muted-foreground">We'll find restaurants there and public parking you can actually use — within your budget and walking distance.</p>

          <form
            className="mt-6 space-y-5 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-6"
            aria-label="Plan your visit"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) navigate({ to: "/explore", search: form });
            }}
          >
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

          <p className="mt-4 text-xs text-muted-foreground">
            Restaurants, parking locations and walking routes come from OpenStreetMap. Parking availability is a prediction from simulated demand data unless marked LIVE. Only parking recorded as publicly accessible is ever suggested.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
