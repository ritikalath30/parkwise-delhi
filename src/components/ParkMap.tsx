// Browser-only: imports Leaflet. Load via MapView (lazy + ClientOnly), never statically from a route.
import { useEffect, useRef } from "react";
import L from "leaflet";
import type { MapPin, MapViewProps } from "./map-types";

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

function restaurantIcon(pin: MapPin, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="pw-pin pw-pin-dine ${pin.dim ? "is-dim" : ""} ${active ? "is-active" : ""}" aria-label="Restaurant">${FORK_SVG}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

function parkingIcon(pin: MapPin, active: boolean) {
  return L.divIcon({
    className: "",
    html: `<div class="pw-pin pw-pin-park ${active ? "is-active" : ""}" style="--avail:${STATUS_VAR[pin.status ?? "good"]}" aria-label="Authorised parking">P</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -16],
  });
}

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
}: MapViewProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const handlersRef = useRef({ onSelectRestaurant, onSelectParking });
  handlersRef.current = { onSelectRestaurant, onSelectParking };

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, { center, zoom, zoomControl: true, scrollWheelZoom: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "© OpenStreetMap contributors",
    }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fit to all pins when the area changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const pts = [...restaurants, ...parkings].map((p) => L.latLng(p.lat, p.lng));
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 17 });
    else map.setView(center, zoom);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    layer.clearLayers();

    if (walkCircle) {
      L.circle(walkCircle.center, {
        radius: walkCircle.radius,
        color: "oklch(0.42 0.085 195)",
        weight: 1.5,
        dashArray: "6 6",
        fillOpacity: 0.06,
      }).addTo(layer);
    }

    if (route && route.length > 1) {
      L.polyline(route, { color: "oklch(0.21 0.04 210)", weight: 5, opacity: 0.25 }).addTo(layer);
      L.polyline(route, { color: "oklch(0.76 0.17 65)", weight: 3, dashArray: "2 8", lineCap: "round" }).addTo(layer);
    }

    for (const p of parkings) {
      const active = p.id === selectedParkingId;
      const m = L.marker([p.lat, p.lng], { icon: parkingIcon(p, active), zIndexOffset: active ? 1000 : 200, title: p.name, keyboard: true })
        .bindTooltip(esc(p.name), { direction: "top", offset: [0, -16] })
        .addTo(layer);
      if (p.popup) m.bindPopup(`<strong>${esc(p.name)}</strong><br/><span>${esc(p.popup)}</span>`);
      m.on("click", () => handlersRef.current.onSelectParking?.(p.id));
    }
    for (const r of restaurants) {
      const active = r.id === selectedRestaurantId;
      const m = L.marker([r.lat, r.lng], { icon: restaurantIcon(r, active), zIndexOffset: active ? 1100 : 300, title: r.name, keyboard: true })
        .bindTooltip(esc(r.name), { direction: "top", offset: [0, -14] })
        .addTo(layer);
      if (r.popup) m.bindPopup(`<strong>${esc(r.name)}</strong><br/><span>${esc(r.popup)}</span>`);
      m.on("click", () => handlersRef.current.onSelectRestaurant?.(r.id));
    }
  }, [restaurants, parkings, selectedRestaurantId, selectedParkingId, route, walkCircle]);

  // Pan to the selected restaurant
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selectedRestaurantId) return;
    const r = restaurants.find((x) => x.id === selectedRestaurantId);
    if (r) map.panTo([r.lat, r.lng], { animate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRestaurantId]);

  return <div ref={elRef} className={className} role="application" aria-label="Interactive map of restaurants and authorised parking" />;
}
