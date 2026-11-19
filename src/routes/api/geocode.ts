import { createFileRoute } from "@tanstack/react-router";

// GET /api/geocode?q=…&lat=…&lng=… → destination suggestions from Photon (OpenStreetMap).
export const Route = createFileRoute("/api/geocode")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const q = u.searchParams.get("q") ?? "";
        const lat = Number(u.searchParams.get("lat"));
        const lng = Number(u.searchParams.get("lng"));
        const bias = Number.isFinite(lat) && Number.isFinite(lng) && u.searchParams.has("lat") ? { lat, lng } : null;
        try {
          const { geocode } = await import("@/lib/places/server");
          const results = await geocode(q, bias);
          return Response.json({ results, source: "Photon (OpenStreetMap data)" }, { headers: { "cache-control": "public, s-maxage=86400, max-age=300" } });
        } catch (e) {
          console.error("Geocode failed", e);
          return Response.json({ results: [], error: "Place search is unavailable right now." }, { status: 502 });
        }
      },
    },
  },
});
