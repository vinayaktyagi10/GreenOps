# 07. UI/UX design

**Stack:** React (Vite), Tailwind, and Recharts. This is desktop-first: a projector demo, not a responsive product, so it's optimized for a single 1920x1080 (or similar) screen read from a few meters away, not for mobile.

## 1. Design principles for this demo

Numbers need to be big and legible from the back of a room; judges won't lean in to read small text. Every visual should map to something judges can independently verify, for example via `docker ps` or `docker logs`, so no chart presents a number that can't be cross-checked live if asked. Live motion sells the story: static screenshots of a dashboard are unconvincing, while a chart that visibly updates as a judge watches, via WebSocket push, is what makes "this actually works" land.

Chart colors follow the `dataviz` skill's palette and consistency guidance (categorical colors for regions/tiers, a sequential scale for carbon intensity heatmaps) rather than being hand-picked ad hoc.

## 2. Screens

### 2.1 Main dashboard (primary demo screen)
Layout, top to bottom:

1. Header bar: project name, a live/replay mode indicator with simulation speed control (for example "Replay @ 60x, 24h in about 24min"), and the current simulated timestamp.
2. Region strip, three cards, one per simulated region: region name, current carbon intensity as a large color-coded number (green/amber/red via the sequential palette), a 24h forecast sparkline, and the region tag (`region=us-east` etc.) so judges can tie it back to `docker ps --filter label=greenops.region=us-east`.
3. Live job timeline, the central and largest panel: a horizontal gantt-style view of jobs moving from submitted to deferred (shown as a waiting bar) to scheduled to running to completed, color-coded by priority tier. This is the panel that should visibly change in real time as the simulation clock advances, and it's the single most important element for convincing a judge the system works.
4. Cumulative savings panel: large headline numbers for total CO2 saved (g), estimated cost saved (USD), and percentage versus a carbon-naive baseline, plus a cumulative area chart over the replay period. This is the panel a judge is most likely to screenshot.
5. Carbon budget burn-down, per namespace: small multiples, one mini bar or gauge per namespace showing budget consumed versus remaining, shifting toward red as budget depletes.
6. Sustainability report panel: the LLM-generated narrative, refreshable on demand (a "Generate Report" button is itself a good live-demo beat), shown alongside the numbers it's grounded in.

### 2.2 Decision detail (secondary, drill-down)
Clicking any job in the timeline opens a side panel showing its `SCHEDULING_DECISIONS` row in human terms, for example: "Deferred 2.5h. us-east forecast to drop from 410 to 240 gCO2/kWh by 02:00; the job's deadline allows it" (rendered from the `reason` field). This answers a skeptical judge's "why did it do that?" question directly from real data rather than a canned explanation.

### 2.3 Container view (secondary, proves it's real)
A simple panel listing actual Docker containers (id, region tag, status) pulled live from the Docker Event Watcher, deliberately kept close to `docker ps` output so it's obviously not a mock. This is useful for the moment a judge asks whether the system is actually running containers or just showing a UI.

## 3. Interaction flow for the live demo

The demo starts in replay mode at a moderate speed, showing a full day compress into a few minutes as savings accumulate visibly. The presenter then submits a new job live, through a small "Submit Workload" form or a prepared API call, with a chosen priority tier, and the dashboard shows it appear in the timeline and get scheduled or deferred in real time.

Next, the presenter demonstrates the `critical` tier invariant by submitting a critical job during a dirty-grid window and showing it scheduled immediately regardless, proving sustainability never compromises urgency. The presenter can also switch to live mode briefly to show the system isn't only replaying canned data, pulling real current readings from Electricity Maps for the actual region the demo is running in, if the network allows. Finally, the presenter clicks "Generate Report" to produce the LLM narrative live.

## 4. Component list (build order)

1. Region strip and carbon intensity/forecast sparkline, needs the `/regions`, `/carbon/current`, and `/forecast` endpoints.
2. Cumulative savings panel, needs `/savings/summary`.
3. Job timeline, needs `/jobs` and the WebSocket `job_update` events. This is the highest build complexity, so prioritize it early.
4. Budget burn-down, needs `/budgets`.
5. Decision detail drill-down, needs `/decisions/{job_id}`.
6. Container view, needs WebSocket `container_update` events from the Docker Event Watcher.
7. Report panel, needs `/reports/generate`.

## 5. Visual style

Dark theme is the default, since it reads better on a projector in a typical hackathon-hall lighting situation. A light theme isn't required for the demo, but components stay theme-token-driven rather than hardcoded so adding one later isn't extra work.

Color language is consistent across every panel: green means clean, saving, or good; amber means moderate; red means dirty, over-budget, or urgent. The region strip, budget gauges, and timeline tier colors shouldn't reuse the same hues for a different meaning.
