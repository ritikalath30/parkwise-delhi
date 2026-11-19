import { createFileRoute } from "@tanstack/react-router";

// GET /api/places?lat=…&lng=… → restaurants, public parking, excluded parking and walking matrix (OpenStreetMap).
export const Route = createFileRoute("/api/places")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        const lat = Number(u.searchParams.get("lat"));
        const lng = Number(u.searchParams.get("lng"));
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
          return Response.json({ error: "lat and lng are required" }, { status: 400 });
        const { loadPlaceData } = await import("@/lib/places/server");
        const data = await loadPlaceData(lat, lng);
        return Response.json(data, {
          status: data.error ? 503 : 200,
          headers: { "cache-control": data.error ? "no-store" : data.demo ? "public, s-maxage=300, max-age=60" : "public, s-maxage=86400, stale-while-revalidate=604800, max-age=600" },
        });
      },
    },
  },
});
