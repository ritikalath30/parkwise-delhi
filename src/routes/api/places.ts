import { createFileRoute } from "@tanstack/react-router";

// GET /api/places?lat=…&lng=… → restaurants, public parking, excluded parking and walking matrix (OpenStreetMap).
export const Route = createFileRoute("/api/places")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const u = new URL(request.url);
        if (u.searchParams.get("probe") === "1") {
          // TEMPORARY diagnostic: tiny query to each Overpass server (status + latency).
          const eps = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
          const results = await Promise.all(
            eps.map(async (ep) => {
              const t = Date.now();
              try {
                const r = await fetch(ep, { method: "POST", headers: { "User-Agent": "ParkWise-GeoAI/1.0 (+https://github.com/ritikalath30/parkwise-delhi)", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent("[out:json][timeout:10];node(1);out;"), signal: AbortSignal.timeout(20000) });
                return { ep, status: r.status, ms: Date.now() - t, body: (await r.text()).slice(0, 140) };
              } catch (e) {
                return { ep, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t };
              }
            }),
          );
          return Response.json(results, { headers: { "cache-control": "no-store" } });
        }
        const lat = Number(u.searchParams.get("lat"));
        const lng = Number(u.searchParams.get("lng"));
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
          return Response.json({ error: "lat and lng are required" }, { status: 400 });
        const { loadPlaceData } = await import("@/lib/places/server");
        const data = await loadPlaceData(lat, lng);
        return Response.json(data, {
          status: data.error ? 503 : 200,
          headers: { "cache-control": data.error ? "no-store" : "public, s-maxage=86400, stale-while-revalidate=604800, max-age=600" },
        });
      },
    },
  },
});
