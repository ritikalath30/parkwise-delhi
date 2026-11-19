// Browser-only: imports Leaflet. Load via MapView (lazy + ClientOnly), never statically from a route.
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet.markercluster";
import "leaflet.markercluster/dist/MarkerCluster.css";
import { Layers, Maximize2, Minimize2, Scan } from "lucide-react";
import type { MapPin, MapViewProps } from "./map-types";
import { cn } from "@/lib/utils";

const FORK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>';

const LEVEL_VAR = { low: "var(--ok)", moderate: "var(--warn)", high: "var(--busy)", "very-high": "var(--busy)" } as const;
const VARIANT_LABEL = { free: "Free", paid: "Paid", shared: "Shared", "fee-unknown": "Price unavailable", excluded: "Private / restricted — never recommended" } as const;

function esc(s: string) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

function icon(kind: "dine" | "park", pin: MapPin, active: boolean) {
  if (kind === "dine") {
    return L.divIcon({
      className: "",
      html: `<div class="pw-pin pw-pin-dine ${pin.dim ? "is-dim" : ""} ${active ? "is-active" : ""}" aria-label="Restaurant: ${esc(pin.name)}">${FORK_SVG}</div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  }
  const v = pin.variant ?? "paid";
  return L.divIcon({
    className: "",
    html: `<div class="pw-pin pw-pin-park pw-pin-${v} ${pin.level ? "" : "no-avail"} ${pin.dim ? "is-dim" : ""} ${active ? "is-active" : ""}" ${pin.level ? `style="--avail:${LEVEL_VAR[pin.level]}"` : ""} aria-label="${VARIANT_LABEL[v]} parking: ${esc(pin.name)}">P</div>`,
    iconSize: v === "excluded" ? [24, 24] : [34, 34],
    iconAnchor: v === "excluded" ? [12, 12] : [17, 17],
  });
}

type Entry = { marker: L.Marker; pin: MapPin; kind: "dine" | "park" };

const AVAIL_TEXT = { low: "likely spaces", moderate: "moderately busy", high: "busy", "very-high": "very busy" } as const;
function popupHtml(kind: "dine" | "park", pin: MapPin, from: MapPin | null) {
  if (kind === "dine") return `<b>${esc(pin.name)}</b><br><span>Restaurant · selected to see parking around it</span>`;
  const v = pin.variant ?? "paid";
  const lines = [`<b>${esc(pin.name)}</b>`, `Car park · ${VARIANT_LABEL[v]}`];
  if (pin.level) lines.push(`Availability: ${AVAIL_TEXT[pin.level]} (estimate from simulated demand, not live)`);
  else lines.push("Availability: unknown");
  if (from) lines.push(`~${Math.round(L.latLng(from.lat, from.lng).distanceTo([pin.lat, pin.lng]) / 10) * 10} m straight-line from ${esc(from.name)}`);
  if (v !== "excluded") lines.push("<i>Selected: details are shown in the list.</i>");
  return lines.join("<br>");
}

const BASES = {
  map: {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors",
    maxNativeZoom: 19,
  },
  // Free, keyless fallback used automatically if the OpenStreetMap tile server fails
  mapFallback: {
    url: "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
    attribution: "© OpenStreetMap contributors © CARTO",
    maxNativeZoom: 19,
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery © Esri, Maxar, Earthstar Geographics — capture dates vary by area; not live",
    maxNativeZoom: 19,
  },
} as const;

export default function ParkMap({
  center,
  zoom,
  fitKey,
  restaurants,
  parkings,
  destination,
  selectedRestaurantId,
  selectedParkingId,
  onSelectRestaurant,
  onSelectParking,
  route,
  cluster = false,
  className,
}: MapViewProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.TileLayer | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | L.MarkerClusterGroup | null>(null);
  const pinnedLayerRef = useRef<L.LayerGroup | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const entriesRef = useRef(new Map<string, Entry>());
  const handlersRef = useRef({ onSelectRestaurant, onSelectParking });
  handlersRef.current = { onSelectRestaurant, onSelectParking };
  const selRef = useRef({ r: selectedRestaurantId, p: selectedParkingId });
  const restaurantsRef = useRef(restaurants);
  restaurantsRef.current = restaurants;
  selRef.current = { r: selectedRestaurantId, p: selectedParkingId };
  const [base, setBase] = useState<"map" | "satellite">("map");
  const [osmFailed, setOsmFailed] = useState(false);
  const [full, setFull] = useState(false);

  const fitAll = () => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [...restaurants, ...parkings.filter((p) => p.variant !== "excluded")].map((p) => L.latLng(p.lat, p.lng));
    if (destination) pts.push(L.latLng(destination.lat, destination.lng));
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 });
    else map.setView(center, zoom);
  };

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { center, zoom, zoomControl: true, scrollWheelZoom: true, minZoom: 3, maxZoom: 19 });
    overlayLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = (
      cluster
        ? L.markerClusterGroup({
            showCoverageOnHover: false,
            maxClusterRadius: 40,
            disableClusteringAtZoom: 18,
            // A cluster groups nearby map pins; show what is inside (car parks vs restaurants), never free spaces.
            iconCreateFunction: (c) => {
              const kids = c.getAllChildMarkers() as (L.Marker & { pwKind?: string })[];
              const parks = kids.filter((m) => m.pwKind === "park").length;
              const dine = kids.length - parks;
              const part = (n: number, cls: string, sym: string) => (n ? `<span class="pw-cl ${cls}">${sym}<b>${n}</b></span>` : "");
              return L.divIcon({
                className: "",
                html: `<div class="pw-cluster2" aria-label="${parks} car parks and ${dine} restaurants grouped here">${part(parks, "pw-cl-park", "P")}${part(dine, "pw-cl-dine", FORK_SVG)}</div>`,
                iconSize: [parks && dine ? 84 : 46, 28],
                iconAnchor: [parks && dine ? 42 : 23, 14],
              });
            },
          }).on("clustermouseover", (e: L.LeafletEvent) => {
            const c = e.layer as L.MarkerCluster;
            const kids = c.getAllChildMarkers() as (L.Marker & { pwKind?: string })[];
            const parks = kids.filter((m) => m.pwKind === "park").length;
            c.bindTooltip(`${parks} car park${parks === 1 ? "" : "s"} · ${kids.length - parks} restaurant${kids.length - parks === 1 ? "" : "s"} grouped here. Click to zoom in.`, { direction: "top" }).openTooltip();
          })
        : L.layerGroup()
    ).addTo(map);
    pinnedLayerRef.current = L.layerGroup().addTo(map); // selected markers stay outside clusters
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      entriesRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    baseRef.current?.remove();
    const b = BASES[base === "map" && osmFailed ? "mapFallback" : base];
    let errors = 0;
    baseRef.current = L.tileLayer(b.url, { maxZoom: 19, maxNativeZoom: b.maxNativeZoom, attribution: b.attribution, subdomains: "abcd" }).addTo(map);
    if (base === "map" && !osmFailed)
      baseRef.current.on("tileerror", () => {
        if (++errors >= 3) setOsmFailed(true); // switch once; no repeated retries
      });
    baseRef.current.bringToBack();
  }, [base, osmFailed]);

  useEffect(() => {
    fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    mapRef.current?.invalidateSize();
  }, [full]);

  // Markers persist across selection changes; only their icons are restyled.
  const pinsKey = JSON.stringify([restaurants, parkings]);
  useEffect(() => {
    const layer = markerLayerRef.current;
    const pinned = pinnedLayerRef.current;
    if (!layer || !pinned) return;
    const next = new Map<string, Entry>();
    const all: [MapPin, "dine" | "park"][] = [...parkings.map((p) => [p, "park"] as [MapPin, "park"]), ...restaurants.map((r) => [r, "dine"] as [MapPin, "dine"])];
    for (const [pin, kind] of all) {
      const key = `${kind}:${pin.id}`;
      const prev = entriesRef.current.get(key);
      const active = kind === "dine" ? pin.id === selRef.current.r : pin.id === selRef.current.p;
      if (prev) {
        prev.marker.setLatLng([pin.lat, pin.lng]);
        prev.marker.setIcon(icon(kind, pin, active));
        prev.pin = pin;
        next.set(key, prev);
        entriesRef.current.delete(key);
        continue;
      }
      const marker = L.marker([pin.lat, pin.lng], { icon: icon(kind, pin, active), zIndexOffset: kind === "dine" ? 300 : 200, title: pin.name, keyboard: true, riseOnHover: true })
        .bindTooltip(esc(kind === "park" ? `${pin.name} · ${VARIANT_LABEL[pin.variant ?? "paid"]}` : pin.name), { direction: "top", offset: [0, -16] })
        .bindPopup("", { offset: [0, -12] });
      (marker as L.Marker & { pwKind?: string }).pwKind = kind;
      (active ? pinned : layer).addLayer(marker);
      marker.on("click", () => {
        marker.setPopupContent(popupHtml(kind, entriesRef.current.get(key)?.pin ?? pin, selRef.current.r ? restaurantsRef.current.find((r) => r.id === selRef.current.r) ?? null : null));
        if (kind === "dine") handlersRef.current.onSelectRestaurant?.(pin.id);
        else handlersRef.current.onSelectParking?.(pin.id);
      });
      next.set(key, { marker, pin, kind });
    }
    for (const e of entriesRef.current.values()) {
      layer.removeLayer(e.marker);
      pinned.removeLayer(e.marker);
    }
    entriesRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsKey]);

  // Selection: restyle, and move selected markers out of clusters so they are always visible.
  useEffect(() => {
    const layer = markerLayerRef.current;
    const pinned = pinnedLayerRef.current;
    if (!layer || !pinned) return;
    for (const e of entriesRef.current.values()) {
      const active = e.kind === "dine" ? e.pin.id === selectedRestaurantId : e.pin.id === selectedParkingId;
      e.marker.setIcon(icon(e.kind, e.pin, active));
      e.marker.setZIndexOffset(active ? 1000 : e.kind === "dine" ? 300 : 200);
      const inPinned = pinned.hasLayer(e.marker);
      if (active && !inPinned) {
        layer.removeLayer(e.marker);
        pinned.addLayer(e.marker);
      } else if (!active && inPinned) {
        pinned.removeLayer(e.marker);
        layer.addLayer(e.marker);
      }
    }
  }, [selectedRestaurantId, selectedParkingId, pinsKey]);

  const overlayKey = JSON.stringify([route, destination]);
  useEffect(() => {
    const layer = overlayLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (destination)
      L.marker([destination.lat, destination.lng], {
        icon: L.divIcon({ className: "", html: '<div class="pw-pin pw-pin-dest" aria-label="Your destination"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: true,
        keyboard: false,
      })
        .bindTooltip(`Destination: ${esc(destination.name)}`, { direction: "top" })
        .addTo(layer);
    if (route && route.length > 1) {
      L.polyline(route, { color: "oklch(0.21 0.04 210)", weight: 5, opacity: 0.25, interactive: false }).addTo(layer);
      L.polyline(route, { color: "oklch(0.76 0.17 65)", weight: 3, dashArray: "2 8", lineCap: "round", interactive: false }).addTo(layer);
    }
  }, [overlayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedRestaurantId) return;
    const e = entriesRef.current.get(`dine:${selectedRestaurantId}`);
    if (e) map.panTo(e.marker.getLatLng(), { animate: true });
  }, [selectedRestaurantId]);

  const btn = "grid h-[30px] w-[30px] place-items-center rounded-[4px] border-2 border-foreground/20 bg-card text-foreground hover:bg-muted";
  return (
    <div ref={wrapRef} className={cn("relative", className, full && "pw-map-fullscreen")}>
      <div ref={elRef} className="h-full w-full" role="application" aria-label="Map of restaurants and parking" />
      <div className="absolute left-3 top-[84px] z-[500] flex flex-col gap-1">
        <button type="button" onClick={fitAll} className={btn} aria-label="Fit all markers" title="Fit all markers"><Scan className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => setFull((f) => !f)} className={btn} aria-label={full ? "Exit full screen" : "Full screen"} title={full ? "Exit full screen (Esc)" : "Full screen"}>
          {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => setBase((b) => (b === "map" ? "satellite" : "map"))}
          className={cn(btn, base === "satellite" && "bg-primary text-primary-foreground")}
          aria-pressed={base === "satellite"}
          aria-label="Satellite imagery"
          title={base === "satellite" ? "Switch to map" : "Satellite imagery (Esri; capture dates vary, not live)"}
        >
          <Layers className="h-3.5 w-3.5" />
        </button>
      </div>
      {base === "satellite" && (
        <div className="absolute bottom-7 right-2 z-[500] max-w-[240px] rounded-md bg-card/95 px-2 py-1 text-[10px] text-muted-foreground shadow">
          Satellite: Esri World Imagery. Capture date varies by area and is not live — for orientation only.
        </div>
      )}
    </div>
  );
}
