<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- Journey: Search (`/`, any destination via `/api/geocode` → Photon) → Explore (`/explore`) → Plan (`/plan`). `/map` and `/recommendations` only redirect to `/explore`; legacy `?area=` links resolve to coordinates in `src/lib/search.ts`.
- Place-data source chain (`src/lib/places/server.ts`): Geoapify if `GEOAPIFY_API_KEY` is set → OpenStreetMap Overpass (9 s budget) → Delhi DEMO DATA (`demo-delhi.json`, fictional, within 3 km of HKV / Khan Market / CP / Saket) with `demo: true` and DEMO DATA labels in the UI. Walking distances from FOSSGIS OSRM. Missing fields stay null and the UI shows "Unknown" — never invent prices, capacity, ratings, hours or facts.
- Parking categories: FREE (fee=no), PAID (fee=yes), FEE UNKNOWN (public, fee not recorded), SHARED (needs an owner-permission source; none integrated). Private / customers-only / no-access / unmarked roadside parking goes to `excluded` and is never recommended.
- Availability is a provider chain in `src/lib/availability.ts`: LIVE and IMAGE ESTIMATE are not operational (awaiting integration / experimental) and return nothing; PREDICTED uses a SIMULATED demand history and must always be labelled as such.
- Eligibility filters (preference, opening hours for the whole stay, walking limit, known price vs budget, restaurant open at arrival) run BEFORE ranking in pure `src/lib/engine.ts`. Users see plain tags (Best match, Cheapest, Closest with likely spaces, Shortest walk) — no numeric scores and no safety scores.
- Trip criteria travel between screens as validated URL search params (`src/lib/search.ts`), so every screen is shareable and needs no login or storage.
- Leaflet is browser-only: import it only in `src/components/ParkMap.tsx`, loaded lazily through `MapView` behind `ClientOnly`. Markers persist across renders and selection only restyles them.
- Tests: `src/test/fixtures/osm-test-area.json` is a SYNTHETIC test fixture. Set `PARKWISE_TEST_FIXTURE` to its path to use it instead of Overpass in local dev/E2E; it is ignored in production and on Vercel.
