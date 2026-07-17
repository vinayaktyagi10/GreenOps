# 05. API specification

**Base URL (local demo):** `http://localhost:8000`
**Format:** JSON over REST, with live updates over WebSocket. No authentication (out of scope per `01_PRD.md`).

## 1. Scheduling engine internals (not externally called, documented for clarity)

The scheduling engine runs an internal tick loop, driven by the simulation clock (see `03_System_Architecture.md §2.10`), rather than an HTTP-invoked webhook. This replaced the originally considered Kubernetes scheduler-extender webhook design (see `02_Technical_Design.md §3.1`). Each tick:

1. Loads all `pending` jobs from `JOBS`.
2. For `critical` tier jobs, immediately calls `docker-py`'s `containers.run(...)` and marks the job `running`.
3. For `standard`/`flexible` tier jobs, calls `policy.decide(job, current_carbon, forecast, budget)`. If approved, it launches the container in the chosen region tag; if not, the job stays `pending` for the next tick.
4. Writes a `SCHEDULING_DECISIONS` row every tick a job is evaluated, including "deferred, retry next tick." This is the full audit trail the dashboard and LLM report read from.

## 2. Public REST API (consumed by the dashboard)

### Regions and carbon data
- `GET /regions`: list of configured regions (`region_id`, `display_name`, `electricity_maps_zone`).
- `GET /carbon/current`: latest `carbon_intensity_gco2_kwh` per region.
- `GET /carbon/history?region_id=&since=&until=`: time series of `CARBON_READINGS`.
- `GET /forecast?region_id=`: latest 24h forecast curve (`FORECASTS` rows) with confidence bounds.

### Jobs
- `GET /jobs?namespace=&status=`: list of jobs with current status, tier, and timestamps.
- `GET /jobs/{job_id}`: single job detail, including its `container_id` once running.
- `POST /jobs`: submit a new workload, for example `{ "namespace": "team-a", "priority_tier": "flexible", "deadline": "...", "image": "...", "command": [...], "preferred_regions": ["us-east", "eu-west"] }`. Creates a `JOBS` row in `pending` status; the scheduling engine picks it up on the next tick.
- `DELETE /jobs/{job_id}`: cancel a pending job, removing it from the queue. A no-op if the job is already running.

### Scheduling decisions
- `GET /decisions?job_id=&namespace=`: decision audit log rows, including the human-readable `reason` field, for the drill-down panel.

### Budgets
- `GET /budgets?namespace=`: budget vs. consumed for each namespace, for the current day.

### Savings
- `GET /savings/summary?since=&until=`: aggregate `estimated_co2_saved_g` and `estimated_cost_saved_usd`, a comparison against `baseline_carbon_intensity_naive`, and counts of jobs deferred or region-shifted. These are the numbers behind the dashboard's headline panel and the LLM report input (`06_AI_Module_Design.md §2.3`).

### Reports
- `POST /reports/generate?since=&until=`: triggers LLM (or template fallback) generation, persists the result to `REPORTS`, and returns the new report.
- `GET /reports/latest`: the most recent report.

### Simulation clock control
- `GET /clock`: current mode (`realtime` or `replay`), speed multiplier, and current simulated timestamp.
- `POST /clock`: `{ "mode": "replay", "speed": 60 }`, switching mode or speed live (used during the demo per `07_UI_UX_Design.md §3`).

### Container cross-check (demo trust-building)
- `GET /containers`: live list of Docker containers currently managed by GreenOps (id, job_id, status, region tag). A thin wrapper over `docker-py`'s `containers.list()`, intentionally kept close to raw `docker ps` output so it's obviously not fabricated.

## 3. WebSocket API

### `WS /ws/live`
A single channel with JSON messages discriminated by `type`:

```json
{ "type": "carbon_reading", "region_id": "us-east", "value": 210.5, "observed_at": "..." }
{ "type": "forecast_update", "region_id": "us-east", "curve": [...] }
{ "type": "job_update", "job_id": "...", "status": "deferred", "reason": "..." }
{ "type": "container_update", "job_id": "...", "container_id": "...", "region": "...", "state": "running" }
{ "type": "budget_update", "namespace": "team-a", "consumed_kg_co2": 3.4, "budget_kg_co2": 5.0 }
{ "type": "clock_update", "mode": "replay", "speed": 60, "simulated_time": "..." }
```

The frontend maintains local state purely by folding these events into the initial REST snapshot loaded on page load, with no polling once connected, which satisfies the under-2s update latency target in `02_Technical_Design.md §4`.

## 4. Error handling

Standard FastAPI validation errors (422) apply to malformed requests. All external dependency failures, such as the Electricity Maps API being down, the Claude API being down, or the Docker daemon being unreachable, are caught at the service boundary and degrade to the documented fallback behavior (`06_AI_Module_Design.md`) rather than surfacing as API errors to the frontend. The dashboard should never show a raw error state during the live demo.
