// Browser-only: imports Leaflet. Load via MapView (lazy + ClientOnly), never statically from a route.
import { useEffect, useRef } from "react";
import L from "leaflet";
import { Maximize2 } from "lucide-react";
import type { MapPin, MapViewProps } from "./map-types";
import { cn } from "@/lib/utils";

const FORK_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>';

const STATUS_VAR: Record<string, string> = {
  good: "var(--ok)",
  limited: "var(--warn)",
  scarce: "var(--busy)",
  closed: "var(--muted-foreground)",
};

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
      popupAnchor: [0, -14],
    });
  }
  return L.divIcon({
    className: "",
    html:
      pin.variant === "restricted"
        ? `<div class="pw-pin pw-pin-park pw-pin-restricted ${active ? "is-active" : ""}" aria-label="Restricted, not legal parking: ${esc(pin.name)}">✕</div>`
        : `<div class="pw-pin pw-pin-park pw-pin-${pin.variant ?? "paid"} ${active ? "is-active" : ""}" style="--avail:${STATUS_VAR[pin.status ?? "good"]}" aria-label="${pin.variant === "free" ? "Free" : pin.variant === "shared" ? "Shared" : "Paid"} authorised parking: ${esc(pin.name)}">P</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
  });
}

function popupHtml(pin: MapPin) {
  const lines = (pin.popupLines ?? []).map((l) => `<div class="pw-popup-line">${esc(l)}</div>`).join("");
  return `<div class="pw-popup"><strong>${esc(pin.name)}</strong>${lines}</div>`;
}

type Entry = { marker: L.Marker; pin: MapPin; kind: "dine" | "park" };

export default function ParkMap({
  center,
  zoom,
  fitKey,
  restaurants,
  parkings,
  selectedRestaurantId,
  selectedParkingId,
  onSelectRestaurant,
  onSelectParking,
  route,
  walkCircle,
  className,
  showPopups = true,
  zones,
}: MapViewProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerLayerRef = useRef<L.LayerGroup | null>(null);
  const overlayLayerRef = useRef<L.LayerGroup | null>(null);
  const entriesRef = useRef(new Map<string, Entry>());
  const handlersRef = useRef({ onSelectRestaurant, onSelectParking });
  handlersRef.current = { onSelectRestaurant, onSelectParking };
  const selRef = useRef({ r: selectedRestaurantId, p: selectedParkingId });
  selRef.current = { r: selectedRestaurantId, p: selectedParkingId };

  const fitAll = () => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [...restaurants, ...parkings].map((p) => L.latLng(p.lat, p.lng));
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 });
    else map.setView(center, zoom);
  };

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { center, zoom, zoomControl: true, scrollWheelZoom: true, minZoom: 12, maxZoom: 19 });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    overlayLayerRef.current = L.layerGroup().addTo(map);
    markerLayerRef.current = L.layerGroup().addTo(map);
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

  // Fit to all pins when the area (or the plan pairing) changes
  useEffect(() => {
    fitAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  // Build markers only when the set of pins or their content changes. Markers persist
  // across selection changes so open popups are not destroyed by a click.
  const pinsKey = JSON.stringify([restaurants, parkings]);
  useEffect(() => {
    const layer = markerLayerRef.current;
    if (!layer) return;
    const next = new Map<string, Entry>();
    const all: [MapPin, "dine" | "park"][] = [
      ...parkings.map((p) => [p, "park"] as [MapPin, "park"]),
      ...restaurants.map((r) => [r, "dine"] as [MapPin, "dine"]),
    ];
    for (const [pin, kind] of all) {
      const key = `${kind}:${pin.id}`;
      const prev = entriesRef.current.get(key);
      const active = kind === "dine" ? pin.id === selRef.current.r : pin.id === selRef.current.p;
      if (prev) {
        prev.marker.setLatLng([pin.lat, pin.lng]);
        prev.marker.setIcon(icon(kind, pin, active));
        if (prev.marker.getPopup()) prev.marker.setPopupContent(popupHtml(pin));
        prev.pin = pin;
        next.set(key, prev);
        entriesRef.current.delete(key);
        continue;
      }
      const marker = L.marker([pin.lat, pin.lng], {
        icon: icon(kind, pin, active),
        zIndexOffset: kind === "dine" ? 300 : 200,
        title: pin.name,
        keyboard: true,
        riseOnHover: true,
      })
        .bindTooltip(esc(pin.name), { direction: "top", offset: [0, -16] })
        .addTo(layer);
      if (showPopups) marker.bindPopup(popupHtml(pin), { autoPan: true, closeButton: true, maxWidth: 260 });
      marker.on("click", () => {
        if (kind === "dine") handlersRef.current.onSelectRestaurant?.(pin.id);
        else handlersRef.current.onSelectParking?.(pin.id);
      });
      next.set(key, { marker, pin, kind });
    }
    // Remove markers no longer present
    for (const e of entriesRef.current.values()) layer.removeLayer(e.marker);
    entriesRef.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinsKey]);

  // Selection only restyles markers
  useEffect(() => {
    for (const e of entriesRef.current.values()) {
      const active = e.kind === "dine" ? e.pin.id === selectedRestaurantId : e.pin.id === selectedParkingId;
      e.marker.setIcon(icon(e.kind, e.pin, active));
      e.marker.setZIndexOffset(active ? 1000 : e.kind === "dine" ? 300 : 200);
    }
  }, [selectedRestaurantId, selectedParkingId, pinsKey]);

  // Route + walking radius
  const overlayKey = JSON.stringify([route, walkCircle, zones]);
  useEffect(() => {
    const layer = overlayLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    for (const z of zones ?? []) {
      L.circle(z.center, {
        radius: z.radius,
        color: "oklch(0.6 0.2 28)",
        weight: 2,
        dashArray: "4 4",
        fillColor: "oklch(0.6 0.2 28)",
        fillOpacity: 0.18,
      })
        .bindTooltip(`⛔ ${esc(z.name)} — ${esc(z.reason)}`, { sticky: true })
        .addTo(layer);
    }
    if (walkCircle) {
      L.circle(walkCircle.center, {
        radius: walkCircle.radius,
        color: "oklch(0.42 0.085 195)",
        weight: 1.5,
        dashArray: "6 6",
        fillOpacity: 0.06,
        interactive: false,
      }).addTo(layer);
    }
    if (route && route.length > 1) {
      L.polyline(route, { color: "oklch(0.21 0.04 210)", weight: 5, opacity: 0.25, interactive: false }).addTo(layer);
      L.polyline(route, { color: "oklch(0.76 0.17 65)", weight: 3, dashArray: "2 8", lineCap: "round", interactive: false }).addTo(layer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayKey]);

  // Selecting from a list pans to the restaurant and opens its details
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedRestaurantId) return;
    const e = entriesRef.current.get(`dine:${selectedRestaurantId}`);
    if (e) {
      map.panTo(e.marker.getLatLng(), { animate: true });
      if (showPopups && !e.marker.isPopupOpen()) e.marker.openPopup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRestaurantId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedParkingId || selectedRestaurantId) return;
    const e = entriesRef.current.get(`park:${selectedParkingId}`);
    if (e) {
      map.panTo(e.marker.getLatLng(), { animate: true });
      if (showPopups && !e.marker.isPopupOpen()) e.marker.openPopup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParkingId]);

  return (
    <div className={cn("relative", className)}>
      <div ref={elRef} className="h-full w-full" role="application" aria-label="Interactive map of restaurants and authorised parking" />
      <button
        type="button"
        onClick={fitAll}
        className="absolute left-3 top-[84px] z-[500] grid h-[30px] w-[30px] place-items-center rounded-[4px] border-2 border-foreground/20 bg-card text-foreground hover:bg-muted"
        aria-label="Fit all markers"
        title="Fit all markers"
      >
        <Maximize2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
