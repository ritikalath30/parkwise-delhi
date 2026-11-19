import { createFileRoute } from "@tanstack/react-router";

// GET /api/ai-search?q=dinner near khan market at 8, free parking, short walk
// → AI-interpreted filters + the destination geocoded within Delhi.
export const Route = createFileRoute("/api/ai-search")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
        if (q.length < 3) return Response.json({ error: "Describe your plan in a few words." }, { status: 400 });
        const { parseTrip } = await import("@/lib/ai/parse.server");
        const { geocode } = await import("@/lib/places/server");
        const intent = await parseTrip(q);
        let destination = null;
        if (intent.place) {
          try {
            const r = (await geocode(intent.place, { lat: 28.6139, lng: 77.209 }))[0];
            if (r) destination = { label: r.detail ? `${r.label}, ${r.detail.split(", ").slice(0, 2).join(", ")}` : r.label, lat: r.lat, lng: r.lng };
          } catch {
            /* geocoder down: return intent without coordinates */
          }
        }
        return Response.json({ intent, destination }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
