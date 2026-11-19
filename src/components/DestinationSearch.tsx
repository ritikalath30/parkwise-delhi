import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import type { GeocodeResult } from "@/lib/places/types";
import { cn } from "@/lib/utils";

/** Destination input with live suggestions from /api/geocode (Photon / OpenStreetMap). */
export function DestinationSearch({
  value,
  onSelect,
  bias,
  autoFocus,
  className,
}: {
  value: string;
  onSelect: (r: GeocodeResult) => void;
  bias?: { lat: number; lng: number } | undefined;
  autoFocus?: boolean;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listId = useId();
  const reqRef = useRef(0);

  useEffect(() => setText(value), [value]);

  useEffect(() => {
    const q = text.trim();
    if (q.length < 2 || q === value) {
      setResults([]);
      setLoading(false);
      return;
    }
    const id = ++reqRef.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const u = new URLSearchParams({ q });
        if (bias) {
          u.set("lat", String(bias.lat));
          u.set("lng", String(bias.lng));
        }
        const res = await fetch(`/api/geocode?${u}`);
        const json = (await res.json()) as { results: GeocodeResult[]; error?: string };
        if (id !== reqRef.current) return;
        setResults(json.results ?? []);
        setError(json.error ?? null);
        setActive(0);
        setOpen(true);
      } catch {
        if (id === reqRef.current) setError("Place search is unavailable right now.");
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [text, value, bias?.lat, bias?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = (r: GeocodeResult) => {
    setText(r.label);
    setOpen(false);
    setResults([]);
    onSelect(r);
  };

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          role="combobox"
          aria-label="Destination"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder="City, area, landmark, address or restaurant"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (!open || !results.length) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => (a + 1) % results.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => (a - 1 + results.length) % results.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(results[active]!);
            } else if (e.key === "Escape") setOpen(false);
          }}
          className="h-12 w-full rounded-xl border border-input bg-card pl-10 pr-10 text-base shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {open && (results.length > 0 || error || (!loading && text.trim().length >= 2 && text !== value)) && (
        <ul id={listId} role="listbox" className="absolute z-[1200] mt-1 max-h-80 w-full overflow-auto rounded-xl border border-border bg-card p-1 shadow-[var(--shadow-float)]">
          {results.map((r, i) => (
            <li
              key={r.id + i}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(r);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn("flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2", i === active && "bg-accent")}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold">{r.label}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {r.kind} · {r.detail || "—"}
                </span>
              </span>
            </li>
          ))}
          {!results.length && <li className="px-3 py-2 text-sm text-muted-foreground">{error ?? "No matching places"}</li>}
          <li className="px-3 pb-1 pt-1 text-[10px] text-muted-foreground">Search by Photon · © OpenStreetMap contributors</li>
        </ul>
      )}
    </div>
  );
}
