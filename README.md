# Missing Podo Investigation Dashboard

## Participant

- Name: Ali Cagan Tanriverdi

## Project Summary

This project turns the 5 Jotform sources in the Missing Podo challenge into a single investigation dashboard.

The core goal was not to dump raw form data into the screen. The goal was to make the investigation readable:

- Where did Podo move?
- Who was last seen with Podo?
- Which person looks most suspicious?
- Which clues increase or weaken suspicion?

To solve that, I built a desktop-first, single-screen investigation flow that combines:

- a suspect directory
- a visual Podo route map
- a linked evidence detail panel
- deterministic person matching
- a transparent suspicion scoring model

## Running the Project

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open:

```text
http://localhost:3000
```

4. For a production check:

```bash
npm run build
```

## Why I Built It This Way

The challenge is small and time-boxed, so I intentionally optimized for clarity over overengineering.

Instead of building a generic data platform, I kept the architecture lean:

- fetch the required Jotform sources
- normalize only the fields needed by the UI
- derive investigation-friendly records
- render one coherent screen that helps the reviewer reach a conclusion quickly

This approach made the product easier to understand, easier to run, and easier to evaluate in a hackathon setting.

## What I Built

| Feature | What it does | Why I added it |
| --- | --- | --- |
| Jotform fetch layer | Fetches questions and submissions for the 5 required forms | Keeps the app compliant with the challenge constraints and makes the data usable immediately |
| `/api/case-data` endpoint | Aggregates the raw sources into one response | Keeps the page component simple and centralizes the data preparation logic |
| Thin normalization layer | Converts Jotform question and answer objects into predictable arrays | Jotform payloads are noisy; normalization reduces friction without over-abstracting the code |
| Deterministic person linking | Canonicalizes names like `Kagan`, `Kagan A.`, and `Kagan` variants under the same person | Prevents duplicate identities and makes cross-source evidence readable |
| Evidence records | Converts every submission into a typed, UI-ready evidence object | Gives the interface one shared format across checkins, messages, sightings, notes, and tips |
| Suspicion scoring model | Scores people based on last confirmed sighting, clue language, tips, solo sightings, alibis, and harmless explanations | Helps the reviewer prioritize likely suspects while keeping the reasoning explainable |
| People directory | Lists all linked people with role labels and suspicion scores | Makes it easy to focus the investigation around one person at a time |
| Search and source filters | Filters by person, clue text, location, and source type | Reduces noise and supports faster investigation in a single screen |
| Podo route map | Replaces the old vertical route list with a node-based route visualization | Makes the journey easier to scan and gives the route stronger visual hierarchy |
| Stop detail mode | Lets the user click a route node and inspect evidence at that stop | Supports location-first investigation instead of only person-first investigation |
| Person detail mode | Shows aliases, key reasons, counter-evidence, direct Podo links, and linked evidence | Makes the suspicion model inspectable rather than opaque |
| Expandable evidence cards | Keeps evidence collapsed by default and expands on demand | Prevents the detail panel from becoming visually overwhelming |
| Loading, empty, and error states | Handles API and filter edge cases cleanly | Keeps the app stable and understandable even when a source fails or a filter returns nothing |
| Build-safe Next.js type reference | Aligns route type references with production builds | Prevents an avoidable build mismatch in `next-env.d.ts` |

## Product Flow

The intended user flow is:

1. Open the dashboard and land directly on the most suspicious person by default.
2. Scan the people column to understand who is in the case and how suspicious each one looks.
3. Follow Podo's movement through the center route map.
4. Click either a person or a route node.
5. Inspect the right-side detail panel to understand evidence, counter-evidence, and provenance.
6. Use search and source filters when the reviewer wants to narrow the investigation.

This flow was chosen because it keeps the reviewer inside one screen instead of forcing them through tabs, pages, or disconnected views.

## Data Flow and Architecture

The app has a very small architecture on purpose.

### 1. Source fetch

The app fetches only the required 5 sources:

- Checkins
- Messages
- Sightings
- Personal Notes
- Anonymous Tips

It uses only these endpoints:

- `GET /form/{id}/questions`
- `GET /form/{id}/submissions?offset=0&limit=1000`

### 2. Normalization

The fetch layer in `lib/case-data.ts` normalizes:

- question objects into arrays
- submission answers into arrays
- submission counts from `submissions.length`

### 3. Investigation derivation

The derivation layer in `lib/investigation.ts` builds:

- `evidenceRecords`
- `people`
- `timelineStops`
- `summary`
- `sourceHealth`
- `defaultSelection`

This is the real heart of the project. Raw form submissions are transformed into a product-ready investigation model.

### 4. UI consumption

The page in `app/page.tsx` consumes `/api/case-data` and renders a three-part dashboard:

- left: people directory
- center: route map
- right: detail panel

## Investigation Logic

The app does not use fuzzy AI logic or hidden ranking rules. The reasoning is deterministic and readable.

### Person matching

People are linked by normalized labels and known aliases so the same person does not appear as multiple identities.

Examples:

- `Kagan`
- `Kagan A.`
- `Kagan` variants with Turkish character differences

### Evidence relevance

Each evidence record is classified into one of three buckets:

- `podo-route`
- `suspect-clue`
- `background`

This makes the route and clue views easier to organize without losing provenance.

### Suspicion scoring

The score increases when a person is connected to stronger suspicious patterns, such as:

- being present in the last confirmed sighting with Podo
- using secret-destination language
- using misleading location language
- receiving medium or high confidence tips
- appearing alone after the last confirmed Podo sighting

The score decreases when counter-evidence appears, such as:

- harmless explanation language
- alibi language connected to technical staff or CerModern

This model was intentionally designed to be explainable. The reviewer can inspect both positive and negative reasons in the UI.

## UX Decisions and Why

### Single-screen dashboard

I chose a one-screen investigation experience because this challenge is better judged through speed and clarity than through complex navigation.

### Three-column layout

The layout separates the investigation into three mental jobs:

- who
- where
- why

This keeps the product legible even when many records are linked together.

### Route map instead of plain route list

The original timeline list was functionally correct, but not visually strong enough. I replaced it with a node-based route map to make Podo's movement feel like a path rather than a stack of cards.

### Expandable evidence cards

The detail panel contains a lot of evidence. Showing everything open by default creates noise. The accordion pattern keeps the summary readable and lets the reviewer drill down only when needed.

### Default focus

The dashboard starts by focusing the strongest suspect so the user is not dropped into an empty or directionless state.

### Clear focus action

Once filtering becomes narrow, users need a fast reset path. The `Clear focus` action resets the investigation without making them manually undo each filter.

## Development Journey

This is the implementation path the project followed:

| Step | What changed | Why it mattered |
| --- | --- | --- |
| 1 | Built the initial Jotform fetch dashboard | Proved the data could be fetched and rendered under challenge constraints |
| 2 | Added the investigation derivation layer | Turned raw submissions into meaningful linked evidence |
| 3 | Replaced debug-style output with an investigation dashboard | Shifted the app from developer-facing to reviewer-facing |
| 4 | Introduced a dark three-column layout | Created a clearer visual hierarchy for the main investigation flow |
| 5 | Simplified and tightened the top controls | Reduced clutter and made filtering faster |
| 6 | Replaced the route list with a node-based route map | Improved route readability and made the center column more compelling |
| 7 | Streamlined the people directory and detail panel | Improved scanning, reduced noise, and made evidence easier to inspect |
| 8 | Fixed the Next.js route type reference for production builds | Kept the project build-safe and cleaner to hand off |

## Tech Stack

- Next.js 16
- React 19
- TypeScript
- Native fetch
- Plain CSS

I deliberately kept the stack minimal. No global state library, no UI kit, and no extra data libraries were needed for the scope of this challenge.

## Environment Notes

The repository includes a working `.env.local` for direct local runs in the challenge environment.

The app uses:

- `JOTFORM_API_KEY`
- `JOTFORM_API_BASE_URL` when provided, otherwise `https://api.jotform.com`

## Files Worth Looking At

- `app/page.tsx`: main UI and interaction flow
- `app/globals.css`: dashboard layout and visual system
- `app/api/case-data/route.ts`: internal API route
- `lib/case-data.ts`: Jotform fetching and normalization
- `lib/investigation.ts`: investigation model, scoring, linking, and summaries

## Scope Decisions

I intentionally did not build:

- a generic entity resolution engine
- a database layer
- a reusable design system package
- fuzzy AI ranking
- multi-page navigation

These would increase complexity without improving the challenge outcome enough.

## If I Had More Time

If time allowed, the next improvements would be:

- source health visibility in the UI
- lightweight test coverage for derivation rules
- better mobile-specific density tuning
- optional export of suspect summaries

## Final Notes

This solution is intentionally opinionated:

- one strong investigation flow
- deterministic linking
- readable heuristics
- minimal architecture
- clear feature rationale

The main product decision was to help the reviewer answer the case quickly, not to show the maximum amount of raw data on screen.
