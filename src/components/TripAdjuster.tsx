import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { PrefToggle } from "@/components/parking-ui";
import { BUDGET_RANGE, HOURS_OPTIONS, todayISO, WALK_RANGE, type CleanSearch, type CriteriaSearch } from "@/lib/search";
import { cn } from "@/lib/utils";

/** Trip filters. Sliders commit on release so results recalculate once per change. */
export function TripAdjuster({ search, onChange, className }: { search: CleanSearch; onChange: (patch: Partial<CriteriaSearch>) => void; className?: string | undefined }) {
  const [budget, setBudget] = useState(search.budget);
  const [walk, setWalk] = useState(search.walk);
  useEffect(() => setBudget(search.budget), [search.budget]);
  useEffect(() => setWalk(search.walk), [search.walk]);
  const today = todayISO();

  return (
    <div className={cn("grid grid-cols-2 gap-3", className)}>
      <div className="space-y-1.5">
        <Label htmlFor="trip-date" className="text-xs">Date</Label>
        <Input id="trip-date" type="date" min={today} value={search.date || today} onChange={(e) => e.target.value && onChange({ date: e.target.value })} className="h-9" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="trip-time" className="text-xs">Arrive at parking</Label>
        <Input id="trip-time" type="time" value={search.time} onChange={(e) => /^\d{2}:\d{2}$/.test(e.target.value) && onChange({ time: e.target.value })} className="h-9" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="trip-hours" className="text-xs">Parking for</Label>
        <Select value={String(search.hours)} onValueChange={(v) => onChange({ hours: Number(v) })}>
          <SelectTrigger id="trip-hours" className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{HOURS_OPTIONS.map((h) => <SelectItem key={h} value={String(h)}>{h} hour{h > 1 ? "s" : ""}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Parking</Label>
        <PrefToggle value={search.pref} onChange={(v) => onChange({ pref: v })} />
      </div>
      <div className={cn("col-span-2 space-y-2", search.pref === "free" && "opacity-50")}>
        <div className="flex justify-between text-xs"><Label>Budget for the stay</Label><span className="font-bold">{search.pref === "free" ? "₹0 (free only)" : `up to ₹${budget}`}</span></div>
        <Slider aria-label="Parking budget" disabled={search.pref === "free"} min={BUDGET_RANGE.min} max={BUDGET_RANGE.max} step={BUDGET_RANGE.step} value={[budget]} onValueChange={([v]) => setBudget(v ?? budget)} onValueCommit={([v]) => onChange({ budget: v ?? budget })} />
      </div>
      <div className="col-span-2 space-y-2">
        <div className="flex justify-between text-xs"><Label>Max walk to the restaurant</Label><span className="font-bold">{walk} m · ~{Math.round(walk / 75)} min</span></div>
        <Slider aria-label="Maximum walking distance" min={WALK_RANGE.min} max={WALK_RANGE.max} step={WALK_RANGE.step} value={[walk]} onValueChange={([v]) => setWalk(v ?? walk)} onValueCommit={([v]) => onChange({ walk: v ?? walk })} />
      </div>
    </div>
  );
}
