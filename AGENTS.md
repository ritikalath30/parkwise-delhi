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

- Journey is three stages: Search (`/`) → Explore (`/explore`, map + top-3 picks + parking comparison) → Plan (`/plan`). `/map` and `/recommendations` only redirect to `/explore`.
- Eligibility filters (authorisation, preference, opening hours, walk, budget, availability floor) run BEFORE scoring. Cost and walking are scored on absolute scales, so budget and walk limit act purely as filters.
- Parking Safety Score lives in pure `src/lib/safety.ts` from SYNTHETIC indicators in `data.ts`; it is a ranking factor only — authorisation stays a hard filter, and UI copy must never claim a facility is safe.
- OSM walking distances come from one OSRM table request per area (`src/lib/walk-matrix.server.ts`, loaded by the Explore/Plan route loaders and the AI server function); when unavailable the engine falls back to straight line × 1.3 and labels it "est.".
- Recommendation scoring lives in pure `src/lib/engine.ts` and is shared by the UI and the AI server function; the server recomputes picks so the AI only explains verified parking that passed every filter.
- Sample data lives in `src/lib/data.ts`; parking with `verified: false` must never reach recommendations (covered by `src/test/recommend.test.ts`).
- Trip criteria travel between screens as validated URL search params (`src/lib/search.ts`), so every screen is shareable and needs no login or storage.
- Leaflet is browser-only: import it only in `src/components/ParkMap.tsx`, loaded lazily through `MapView` behind `ClientOnly`. Markers persist across renders and selection only restyles them (rebuilding on every click destroyed open popups).
- Rank reasons and fallback explanations come from `src/lib/explain.ts`; the AI only rewords them, so explanations are shown instantly and never contradict the scores.
