# ParkWise Delhi: handoff summary

Use this file to continue the work in any other AI tool. Paste it in as context.

## What this is
A product-management interview case: **ParkWise**, a Delhi-first planner that pairs a restaurant with a legal car park and the real walk between them. Deliverables: a 6–8 slide deck plus a public prototype link.

- **Live prototype:** https://parkwise-delhi.vercel.app (public, no login, no personal data, no API keys in the browser)
- **Repo:** github.com/ritikalath30/parkwise-delhi. The `main` branch auto-deploys to Vercel and syncs to Lovable. The `live-data` branch is kept equal to `main`.
- **Deck (9 slides, Slides artifact, downloads as .pptx/PDF):** https://claude.ai/artifact/MoYiBes8MiQnmBrEA1sWRj. It's private until shared from its Share menu.

## User journey (prototype)
1. **Search (`/`)**: only a "Describe your plan" box shows at first. The user types e.g. "Dinner at Connaught Place with my elderly parents, happy to pay for parking".
   - The AI extracts the destination, stay length, free/paid preference, budget and walking limit.
   - If no time was given, it highlights date and time inputs ("When are you going? (not mentioned)"). Meal words set a default time: dinner 8 pm, lunch 1 pm, breakfast 9:30.
   - Only after the destination is found does "Check or adjust what the AI understood" appear. The "See restaurants & parking →" button continues.
2. **Explore (`/explore`)**: restaurants within 700 m and public car parks within 1.5 km, shown in a list and on a Leaflet map. The map legend floats on top of the map; filters sit behind "Edit trip".
3. **Plan (`/plan`)**: the chosen restaurant and car park, charge, predicted availability (labelled), walking route and directions.

Trip criteria travel as URL search params (`src/lib/search.ts`), so every screen is shareable.

## How the AI works (and how to defend it)
- **On-device model:** MiniLM (`Xenova/all-MiniLM-L6-v2`, q8) runs in the browser via `@huggingface/transformers` 3.7.5. The model files live in `/public/models` and the ONNX runtime in `/public/ort`. Code: `src/lib/ai/semantic.ts`.
  - It splits the text into phrases, embeds each one and compares it with example intents (threshold 0.5), e.g. "with my elderly parents" → short walk, 83%.
  - It shows its match scores on screen. It's free, private and needs no key.
- **Rules parser:** `src/lib/ai/rules.ts` handles numbers, times, budgets, places and meal words. It's merged with the model's result.
- **Optional Claude:** `src/lib/ai/parse.server.ts` and `src/routes/api/ai-search.ts` use Claude only if `ANTHROPIC_API_KEY` is set. It isn't set, because the user doesn't want to pay.
- **Guardrail:** the AI only interprets intent. Places, prices and hours come from map data, so it can't invent a car park.
- **Typos:** "khaan market" → Khan Market and "canught place" → Connaught Place, through the local gazetteer and bigram similarity in `src/lib/places/server.ts`.

## Data
- **Bundled OpenStreetMap snapshot of Delhi** (BBBike extract, 14 Nov 2026) in `src/lib/places/delhi-osm.json`, with counts in `delhi-stats.ts`: 3,281 restaurants, 934 car parks, 9,444 shops.
  - 205 car parks are private or customers-only, so they're excluded.
  - 174 record whether they charge; 4 list a price.
- **Local gazetteer:** 1,773 places (`delhi-gazetteer.json`).
- **Live services:** Photon geocoding (backup), FOSSGIS OSRM for walking routes, Overpass only outside Delhi, Geoapify if `GEOAPIFY_API_KEY` is set.
- **Parking categories:** FREE, PAID, FEE UNKNOWN, SHARED. Private, customers-only and unmarked roadside parking go to `excluded` and are never recommended.
- **Availability** (`src/lib/availability.ts`): LIVE and IMAGE ESTIMATE are placeholders that return nothing. PREDICTED uses simulated history and is always labelled.
- **Engine** (`src/lib/engine.ts`): filters run first (preference, opening hours for the whole stay, walking limit, budget, restaurant open at arrival), then ranking. Users see plain tags (Best match, Cheapest, Closest with likely spaces, Shortest walk). There are no numeric scores and no safety scores.

## Tech
TanStack Start (React, file routes, server functions), Vite, Nitro, Tailwind and shadcn, Leaflet with markercluster (browser-only, in `src/components/ParkMap.tsx`). There are 46 Vitest tests in `src/test/`.
- Build: `npx vite build`
- Local production run: `NITRO_PRESET=node-server npx vite build && node .output/server/index.mjs`
- Rules for this repo: see `AGENTS.md`. Don't force-push, and don't edit Supabase migrations or generated files.

## Deck outline (current)
1. **Cover:** "Know where you'll park before you leave for dinner." Add your name.
2. **Problem:** who (people who drive to eat out at CP, Khan Market, Hauz Khas, Lajpat Nagar), what goes wrong, why it matters. Bar chart: 934 mapped / 205 private / 174 fee known / 4 priced.
3. **User insight:** today's workaround flow (Zomato → call the restaurant → "parking near me" → circle). Four insights: the restaurant comes first; legal beats close; the walk is part of the plan; data is the gap.
4. **Solution:** a value-vs-ease matrix of four options (sensors, satellite counting, booking app, restaurant-first planner ✓), plus what's in and out of V1.
5. **Journey and AI:** Describe (AI) → Confirm (AI) → Explore → Plan, with a "what the AI understood" example, the guardrail and a screenshot.
6. **Prototype:** link, four badges, three screenshots, three learnings.
7. **Metrics:**
   - North Star: successful parked outings per week (target 500/week in CP by month 3 of the pilot).
   - Inputs: search → plan ≥40%, plan → directions ≥50%, AI understood without edits ≥80%, data coverage 2% → 60%, 30-day return ≥25%.
   - Guardrails: 0 private lots recommended, <5 "lot full or closed" reports per 100 plans, <3 s to results.
8. **Revenue:** free for diners.
   - Phase 1: restaurants pay ₹1,500/month for a "Parking sorted" listing.
   - Phase 2: 10–15% commission on parking bookings.
   - Phase 3: a parking API for dining apps at ₹0.50 per call.
   - Example: 150 restaurants → ₹27 L a year.
   - All prices are assumptions to test.
9. **Market, risks and next 90 days:** compared with Google Maps, Park+, Zomato and SpotHero. Risks and mitigations. Pilot CP → restaurants → live data → scale.

Metric targets and prices are proposed, not measured. Say so if asked.

## Open items before the interview
- Add your name on the cover.
- Talk to 3–5 people who drive to restaurants, so the insight slide is backed by real conversations. Be ready to say how many.
- Demo with Connaught Place, which has the best data. Khan Market shows the data gap; frame it as the reason for operator partnerships.
- Likely questions:
  - "Is availability real-time?" No: it's a labelled prediction, and real-time needs operator partnerships.
  - "Where's the AI?" On-device MiniLM intent understanding, with Claude as an optional upgrade.
  - "Why not booking?" Delhi has little bookable inventory.
