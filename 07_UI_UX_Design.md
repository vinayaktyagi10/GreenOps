# 07 — UI / UX Design

**Stack:** React (Vite) + Tailwind + Recharts. Desktop-first — this is a projector demo, not a responsive product; optimize for a single 1920x1080 (or similar) screen read from a few meters away, not mobile.

## 1. Design Principles for This Specific Demo

- **Numbers must be big and legible from the back of a room.** Judges will not lean in to read small text.
- **Every visual must map to something judges can independently verify** (e.g. via `docker ps`/`docker logs`) — no chart should present a number that can't be cross-checked live if asked.
- **Live motion sells the story.** Static screenshots of a dashboard are unconvincing; a chart that visibly updates while a judge watches (via WebSocket push) is what makes "this actually works" land.
- Follow the `dataviz` skill's palette/consistency guidance for all charts (categorical colors for regions/tiers, sequential scale for carbon intensity heatmaps) — do not hand-pick chart colors ad hoc.

## 2. Screens

### 2.1 Main Dashboard (primary demo screen)
Layout, top to bottom / left to right:

1. **Header bar**: project name, live/replay mode indicator + simulation speed control (e.g. "Replay @ 60x — 24h ≈ 24min"), current simulated timestamp.
2. **Region strip** (3 cards, one per simulated region): region name, current carbon intensity (large number, color-coded green/amber/red via the sequential palette), 24h forecast sparkline, region tag (`region=us-east` etc.) so judges can tie it back to `docker ps --filter label=greenops.region=us-east`.
3. **Live job timeline** (central, largest panel): a horizontal timeline/gantt-style view of jobs — submitted → deferred (shown as a waiting bar) → scheduled → running → completed, color-coded by priority tier. This is the panel that should visibly change in real time as the simulation clock advances — the single most important "wow" element.
4. **Cumulative savings panel**: big headline numbers — total CO2 saved (g), estimated cost saved (USD), percentage vs. carbon-naive baseline — plus a cumulative area chart over the replay period. This is the panel a judge screenshots.
5. **Carbon budget burn-down** (per namespace): small multiples — one mini bar/gauge per namespace showing budget consumed vs. remaining, color-shifting toward red as budget depletes.
6. **Sustainability report panel**: the LLM-generated narrative (refreshable on demand — a button, "Generate Report," is itself a good live-demo beat) shown alongside the numbers it's grounded in.

### 2.2 Decision Detail (secondary, drill-down)
Clicking any job in the timeline opens a side panel showing the `SCHEDULING_DECISIONS` row for it in human terms: "Deferred 2.5h — us-east forecast to drop from 410 to 240 gCO2/kWh by 02:00; job deadline allows it (rendered from the `reason` field)." This is what answers a skeptical judge's "why did it do that?" question directly from real data, not a canned explanation.

### 2.3 Container View (secondary, proves it's real)
A simple panel listing actual Docker containers (id, region tag, status) pulled live from the Docker Event Watcher — deliberately kept close to `docker ps` output so it's obviously not a mock. Good for the moment a judge asks "is this actually running containers, or just a UI?"

## 3. Interaction Flow for the Live Demo

1. Start in replay mode at a moderate speed, showing a full day compress into a few minutes — savings accumulate visibly.
2. Presenter submits a new job live (via a small "Submit Workload" form or a prepared API call) with a chosen priority tier — dashboard shows it appear in the timeline and get scheduled/deferred in real time.
3. Presenter demonstrates the `critical` tier invariant: submits a critical job during a dirty-grid window and shows it scheduled immediately regardless (proving sustainability never compromises urgency).
4. Presenter switches to live mode briefly to show it's not only replay — pulls real current data from Electricity Maps for the actual region the demo is running in, if network allows.
5. Presenter clicks "Generate Report" to produce the LLM narrative live.

## 4. Component List (build order, matches `08_Development_Plan.md`)

1. Region strip + carbon intensity/forecast sparkline (needs: `/regions`, `/carbon/current`, `/forecast` endpoints)
2. Cumulative savings panel (needs: `/savings/summary`)
3. Job timeline (needs: `/jobs`, WebSocket `job_update` events) — highest build complexity, prioritize early
4. Budget burn-down (needs: `/budgets`)
5. Decision detail drill-down (needs: `/decisions/{job_id}`)
6. Container view (needs: WebSocket `container_update` events from the Docker Event Watcher)
7. Report panel (needs: `/reports/generate`)

## 5. Visual Style

- Dark theme by default (reads better on a projector in a typical hackathon-hall lighting situation), light theme not required for the demo but keep components theme-token-driven rather than hardcoded so it's not extra work to add later.
- Color language: green = clean/savings/good, amber = moderate, red = dirty/over-budget/urgent — consistent across every panel (region strip, budget gauges, timeline tier colors should not reuse the same hues for a different meaning).
