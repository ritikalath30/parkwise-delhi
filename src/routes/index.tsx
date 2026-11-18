import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useState } from "react";
import { Tag, ArrowRight, Clock, Footprints, IndianRupee, MapPin, Sparkles, Timer } from "lucide-react";
import heroImg from "@/assets/hauz-khas-dusk.jpg";
import { Logo, SimulatedNotice, SiteFooter, StepNav } from "@/components/AppShell";
import { PrefToggle } from "@/components/parking-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AREA_LIST } from "@/lib/data";
import { BUDGET_RANGE, cleanSearch, criteriaSearchSchema, WALK_RANGE, type CriteriaSearch } from "@/lib/search";

export const Route = createFileRoute("/")({
  validateSearch: zodValidator(criteriaSearchSchema),
  head: () => ({
    meta: [
      { title: "ParkWise GeoAI — Find restaurants with authorised parking in Delhi" },
      { name: "description", content: "Plan a meal in Hauz Khas Village, Khan Market or Connaught Place with authorised parking nearby. Set arrival time, parking budget and walking distance." },
      { property: "og:title", content: "ParkWise GeoAI — Dine without the parking hunt" },
      { property: "og:description", content: "Restaurants in crowded Delhi areas ranked by authorised parking availability, cost and walking distance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SearchScreen,
});

function SearchScreen() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [form, setForm] = useState<CriteriaSearch>(() => cleanSearch(search));
  const set = <K extends keyof CriteriaSearch>(k: K, v: CriteriaSearch[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/explore", search: cleanSearch(form) });
  };

  return (
    <div className="min-h-screen bg-background">
      <section className="relative isolate overflow-hidden bg-ink">
        <img src={heroImg} alt="Hauz Khas Village lake and domed ruins at dusk" width={1600} height={1008} className="absolute inset-0 -z-10 h-full w-full object-cover" />
        <div className="absolute inset-0 -z-10 bg-hero-overlay" />

        <header className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 md:flex-row md:items-center md:justify-between">
          <Logo light />
          <div className="rounded-full bg-background/90 p-1 backdrop-blur">
            <StepNav search={cleanSearch(form)} />
          </div>
        </header>

        <div className="mx-auto grid max-w-7xl gap-8 px-4 pb-14 pt-10 md:pt-20 lg:grid-cols-[1.1fr_1fr] lg:items-end lg:pb-20">
          <div className="text-ink-foreground">
            <span className="inline-flex items-center gap-2 rounded-full border border-ink-foreground/30 bg-ink-foreground/10 px-3 py-1 text-xs font-medium backdrop-blur">
              <Sparkles className="h-3.5 w-3.5 text-signal" /> AI-ranked · authorised parking only · safety-aware
            </span>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.02] sm:text-5xl lg:text-6xl">
              Eat out in Delhi.
              <br />
              <span className="text-signal">Skip the parking hunt.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base text-ink-foreground/85 sm:text-lg">
              Restaurants matched with authorised parking that fits your budget, time and walking limit — ranked on availability, safety and distance.
            </p>
          </div>

          <form onSubmit={submit} className="rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-float)] sm:p-6" aria-label="Plan your visit">
            <h2 className="text-xl font-bold">Plan your visit</h2>

            <div className="mt-5 space-y-5">
              <div className="space-y-2">
                <Label htmlFor="dest" className="flex items-center gap-1.5"><MapPin className="h-4 w-4 text-primary" /> Destination</Label>
                <Select value={form.area} onValueChange={(v) => set("area", v)}>
                  <SelectTrigger id="dest" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AREA_LIST.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="time" className="flex items-center gap-1.5"><Clock className="h-4 w-4 text-primary" /> Arrive at parking</Label>
                  <Input id="time" type="time" required value={form.time} onChange={(e) => set("time", e.target.value)} className="h-11" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hours" className="flex items-center gap-1.5"><Timer className="h-4 w-4 text-primary" /> Stay</Label>
                  <Select value={String(form.hours)} onValueChange={(v) => set("hours", Number(v))}>
                    <SelectTrigger id="hours" className="h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6].map((h) => (
                        <SelectItem key={h} value={String(h)}>{h} hour{h > 1 ? "s" : ""}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Day</Label>
                <ToggleGroup type="single" value={form.day} onValueChange={(v) => v && set("day", v)} className="grid grid-cols-2 rounded-lg bg-muted p-1">
                  <ToggleGroupItem value="weekday" className="data-[state=on]:bg-card data-[state=on]:shadow-sm">Weekday</ToggleGroupItem>
                  <ToggleGroupItem value="weekend" className="data-[state=on]:bg-card data-[state=on]:shadow-sm">Weekend</ToggleGroupItem>
                </ToggleGroup>
              </div>

              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Tag className="h-4 w-4 text-primary" /> Parking preference</Label>
                <PrefToggle value={form.pref} onChange={(v) => set("pref", v)} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5"><IndianRupee className="h-4 w-4 text-primary" /> Parking budget</Label>
                  <span className="font-display text-sm font-bold">up to ₹{form.budget}</span>
                </div>
                <Slider aria-label="Parking budget" min={BUDGET_RANGE.min} max={BUDGET_RANGE.max} step={BUDGET_RANGE.step} value={[form.budget]} onValueChange={([v]) => set("budget", v ?? form.budget)} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-1.5"><Footprints className="h-4 w-4 text-primary" /> Max walking distance</Label>
                  <span className="font-display text-sm font-bold">{form.walk} m · ~{Math.round(form.walk / 75)} min</span>
                </div>
                <Slider aria-label="Maximum walking distance" min={WALK_RANGE.min} max={WALK_RANGE.max} step={WALK_RANGE.step} value={[form.walk]} onValueChange={([v]) => set("walk", v ?? form.walk)} />
              </div>

              <Button type="submit" variant="signal" size="xl" className="w-full">
                Explore restaurants & parking <ArrowRight />
              </Button>
              <SimulatedNotice />
            </div>
          </form>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
