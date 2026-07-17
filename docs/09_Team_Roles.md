# 09. Team roles and assignments

**Project:** GreenOps, a carbon-aware container scheduler
**Event:** SYNERGY 2026 Innovation & Career Summit, HPE Hackathon (Problem Statement 01)
**Window:** 14 July 2026 to 31 July 2026 (Grand Finale)
**Team:** Vinayak, Harsh, Aryan, Rohit

---

## What we're building

A real, working carbon-aware scheduling engine for containerized workloads. It watches live and forecasted grid carbon intensity across simulated regions and decides when and where to actually run a Docker container: deferring non-urgent jobs to cleaner hours, placing them in cleaner regions, and never delaying urgent (`critical`-tier) jobs. Real containers genuinely don't exist until the policy approves them, verifiable live via `docker ps`, not a mocked status flag.

On top of that: a forecasting model that predicts next-24h carbon intensity per region, a carbon budget system per team/namespace, an LLM-generated plain-English sustainability report, and a live React dashboard tying it all together. A simulation clock replays historical carbon data at speed so the demo works even if venue wifi or the live API fails.

Full docs are in `docs/` for deep detail on any piece; this file is just the who-owns-what summary.

---

## Roles

| Person | Role | Owns |
|---|---|---|
| Vinayak | Infra/Scheduling Lead | Scheduling engine, Docker integration (`docker-py`), region tagging, Docker event watcher for the dashboard |
| Rohit | Backend/Data Lead | FastAPI app skeleton, SQLite schema and SQLAlchemy models, carbon ingestion service, simulation clock, REST and WebSocket API |
| Aryan | ML Lead | Forecasting model (Prophet and fallback), policy engine scoring logic, evaluation and tuning against replayed data |
| Harsh | Frontend/Integration Lead | React dashboard, LLM reporting service integration, demo script rehearsal coordination |

Roles overlap on integration points. This is primary ownership, not exclusive responsibility, so no component depends on a single person's knowledge.

---

## Vinayak, Infra/Scheduling Lead

- Build the scheduling engine: a real job queue with `docker-py` wired up to actually create, start, and stop containers.
- Design the region tagging scheme for simulating 3 regions on one demo machine.
- Build the Docker Event Watcher, which feeds live container state to the dashboard (`container_update` events).
- Week 1 exit bar: a manually submitted test job results in a real Docker container, observable via `docker ps` (no policy yet, always-approve).
- Week 2: wire the scheduling engine to Aryan's policy engine so `standard`/`flexible` jobs are genuinely deferred or region-placed, and the `critical` tier invariant (always launches immediately) is enforced and tested.

## Rohit, Backend/Data Lead

- Build the FastAPI skeleton and SQLite schema (see `04_Database_Design.md`), plus the SQLAlchemy models.
- Build the carbon ingestion service: live-mode polling against the real Electricity Maps API, plus replay mode from historical data.
- Build the simulation clock, the piece that runs the whole system against replayed historical data at accelerated speed, independent of wall-clock time. This is what keeps the demo reliable without venue wifi.
- Build the full REST and WebSocket API (see `05_API_Specification.md`).
- Day 1 priority, do not delay: sign up for the Electricity Maps API and start historical data collection immediately. Forecasting needs history, so the earlier this starts, the better Aryan's model will be. This is the single most time-sensitive dependency in the whole project.

## Aryan, ML Lead

- Build the forecasting model, starting with the weighted moving average fallback (simple, needs less history): `0.6 * recent_trend + 0.4 * same_hour_yesterday`. Attempt Prophet after that as the upgrade. The harder path never ships untested on its own.
- Build the policy engine scoring function, which combines current and forecasted carbon intensity, workload priority tier, and carbon budget:
  ```
  score(region, t) = w1 * normalize(current_intensity)
                    + w2 * normalize(forecast_trend)
                    - w3 * urgency_penalty(job, t)
  ```
- Week 3: tune `w1/w2/w3` against replayed data until scheduling decisions look clearly sensible for the demo.
- Expect to pair closely with Vinayak, who consumes the score in the scheduling engine, and Rohit, who owns the data this trains on. This role doesn't require prior ML depth; it's mostly gluing together an existing library and tuning weights against real output.

## Harsh, Frontend/Integration Lead

- Build the React dashboard (Vite, Tailwind, Recharts) in this order (see `07_UI_UX_Design.md §4`):
  1. Region strip and carbon/forecast sparkline.
  2. Cumulative savings panel.
  3. Job timeline. This is the highest-complexity piece and the main "it works" panel, so start it early.
  4. Budget burn-down.
  5. Decision detail drill-down.
  6. Container view, which ties to `docker ps` and proves the system is real.
  7. LLM report panel.
- Integrate the LLM reporting service, including the Claude API call and the template-based fallback for when the API is down.
- Own demo script rehearsal coordination. Since Harsh will likely be narrating, he should drive the dry-run scheduling and timing.

---

## Timeline

- Week 1 (14 to 20 July), foundations: Rohit's Electricity Maps signup and data collection start on day 1. Vinayak gets a test container running via `docker ps`. FastAPI and the schema are stood up.
- Week 2 (21 to 27 July), core logic: Aryan's policy engine is wired into Vinayak's scheduling engine. The simulation clock works. Harsh builds the dashboard against the real API.
- Week 3 (28 to 31 July), polish and rehearsal: the LLM report layer is integrated, at least two full dry-runs are timed, weights are tuned, and scope freezes on the evening of 30 July, with no new features on the day of the demo.
