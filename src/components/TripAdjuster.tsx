import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { BUDGET_RANGE, WALK_RANGE, type CriteriaSearch } from "@/lib/search";

/** Inline trip controls; every change updates the URL so rankings recompute instantly. */
export function TripAdjuster({ search, onChange }: { search: CriteriaSearch; onChange: (patch: Partial<CriteriaSearch>) => void }) {
  const [budget, setBudget] = useState(search.budget);
  const [walk, setWalk] = useState(search.walk);
  const [time, setTime] = useState(search.time);
  useEffect(() => setBudget(search.budget), [search.budget]);
  useEffect(() => setWalk(search.walk), [search.walk]);
  useEffect(() => setTime(search.time), [search.time]);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold">
        <SlidersHorizontal className="h-4 w-4 text-primary" /> Adjust your trip — picks update instantly
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_1fr_1fr] lg:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="adj-time" className="text-xs">Arrival</Label>
          <Input
            id="adj-time"
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              if (/^\d{2}:\d{2}$/.test(e.target.value)) onChange({ time: e.target.value });
            }}
            className="h-9 w-full lg:w-32"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Day</Label>
          <ToggleGroup type="single" value={search.day} onValueChange={(v) => v && onChange({ day: v })} className="grid h-9 grid-cols-2 rounded-lg bg-muted p-0.5">
            <ToggleGroupItem value="weekday" className="h-8 text-xs data-[state=on]:bg-card data-[state=on]:shadow-sm">Weekday</ToggleGroupItem>
            <ToggleGroupItem value="weekend" className="h-8 text-xs data-[state=on]:bg-card data-[state=on]:shadow-sm">Weekend</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="adj-hours" className="text-xs">Stay</Label>
          <Select value={String(search.hours)} onValueChange={(v) => onChange({ hours: Number(v) })}>
            <SelectTrigger id="adj-hours" className="h-9 w-full lg:w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3, 4, 5, 6].map((h) => <SelectItem key={h} value={String(h)}>{h} hour{h > 1 ? "s" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs"><Label>Parking budget</Label><span className="font-bold">≤ ₹{budget}</span></div>
          <Slider aria-label="Parking budget" min={BUDGET_RANGE.min} max={BUDGET_RANGE.max} step={BUDGET_RANGE.step} value={[budget]} onValueChange={([v]) => setBudget(v ?? budget)} onValueCommit={([v]) => onChange({ budget: v ?? budget })} />
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs"><Label>Max walk</Label><span className="font-bold">≤ {walk} m</span></div>
          <Slider aria-label="Maximum walking distance" min={WALK_RANGE.min} max={WALK_RANGE.max} step={WALK_RANGE.step} value={[walk]} onValueChange={([v]) => setWalk(v ?? walk)} onValueCommit={([v]) => onChange({ walk: v ?? walk })} />
        </div>
      </div>
    </div>
  );
}
