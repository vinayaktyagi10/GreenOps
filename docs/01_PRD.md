# 01. Product Requirements Document (PRD)

**Project:** GreenOps, a carbon-aware container scheduler
**Event:** SYNERGY 2026 Innovation & Career Summit, HPE Hackathon (Problem Statement 01)
**Grand Finale demo:** 31 July 2026

---

## 1. Problem statement

Electricity grids vary significantly in carbon intensity throughout the day and across regions, depending on the live mix of renewable vs. non-renewable generation. Compute infrastructure today is scheduled with zero awareness of this. A batch job run at 2pm on a coal-heavy grid emits far more CO2 than the identical job run at 2am on a wind-heavy grid, or run in a different region entirely. There is no widely deployed, easy-to-adopt mechanism that makes carbon intensity a first-class scheduling signal alongside CPU and memory.

## 2. Goal

Build a real, working carbon-aware scheduling engine that defers and places non-urgent containerized workloads based on live and forecasted grid carbon intensity, across both time (defer to a cleaner hour) and space (place in a cleaner region), and prove the resulting carbon savings with a live, credible dashboard and demo.

This is not a simulation of scheduling. Real Docker containers are deferred (they do not exist until the policy approves them) and placed by a real scheduling engine.

## 3. Why this is worth building

HPE's GreenLake and sustainability commitments center on making infrastructure decisions carbon- and cost-aware, so this project speaks HPE's own strategic language.

Most "carbon-aware scheduling" projects build a job queue with an if-statement that flips a status flag. This one builds a real scheduling engine where containers do not exist until approved, which is verifiable live via `docker ps`, and adds a spatial (multi-region) dimension most simple examples skip. Between the scheduling engine, the forecasting model, the LLM reporting layer, and the carbon budget system, there's enough surface area for a substantive technical conversation with judges rather than a demo click-through.

## 4. Target users (in the enterprise, hypothetically)

- Platform/infra teams who want to reduce the carbon footprint of batch and non-urgent workloads without manual intervention.
- Sustainability/FinOps teams who need auditable reporting on carbon impact and budget compliance per team or namespace.
- On-call/SRE teams who need urgent workloads to always bypass carbon-aware deferral. Correctness and availability must never be sacrificed for sustainability.

## 5. Scope

### In scope (v1, hackathon build)
1. A Docker-based scheduling engine that owns a real job queue and only creates a container when its policy approves the job (see `03_System_Architecture.md`).
2. A priority-tiered workload model: `critical` (never deferred, always scheduled immediately), `standard` (deferred within a bounded SLA window), `flexible` (deferred aggressively for maximum carbon savings).
3. Live and historical carbon intensity ingestion from the Electricity Maps API, for at least 3 simulated regions.
4. A forecasting model predicting next-24h carbon intensity per region.
5. A scheduling policy that combines current and forecasted carbon intensity, workload priority tier, and per-namespace carbon budget to decide when and in which region to run a container.
6. A carbon budget system: each namespace/team has a carbon budget, the dashboard shows budget burn-down, and the scheduler can be configured to hard-enforce budgets for `flexible` tier workloads.
7. An LLM-generated plain-English sustainability report summarizing scheduling decisions and savings over a period.
8. A live React dashboard: region view, carbon intensity and forecast charts, a job/container timeline (scheduled vs. deferred vs. running), cumulative carbon and cost savings, budget burn-down, and an LLM report panel.
9. A simulation clock that runs the whole system against replayed historical carbon data at accelerated speed, so the demo doesn't depend on venue wifi or live API availability.

### Out of scope (v1)
- Multi-host/distributed Docker. A single demo machine with simulated multi-region carbon signals is sufficient (see `02_Technical_Design.md §3.3`).
- Real cost billing integration. Cost savings are estimated, not billed.
- Authentication/multi-tenant user accounts. Namespace as a team proxy is sufficient for the demo.
- Production-grade high availability of the scheduling engine itself.

## 6. Key user stories

- As a platform engineer, I submit a workload with a priority tier and deadline, and the scheduler defers or places it according to live and forecasted carbon intensity without me doing anything else.
- As a sustainability lead, I open the dashboard and see, for the last N hours, how much CO2 (and estimated cost) was saved versus a carbon-naive baseline scheduler.
- As a team lead, I see my namespace's carbon budget burn-down and get flagged before I exceed it.
- As an SRE, I confirm that `critical`-tier workloads are never delayed by the carbon-aware policy, regardless of grid conditions.
- As an HPE judge, I watch a live demo where submitted workloads visibly get deferred or placed differently as the simulated carbon signal changes, and see the dashboard update in real time.

## 7. Success metrics (for the demo, not production)

| Metric | Target |
|---|---|
| Real containers actually deferred/placed by the scheduling engine (not mocked) | 100% of `standard`/`flexible` tier jobs |
| Critical-tier jobs delayed by carbon policy | 0 |
| Forecasting model MAPE on held-out carbon intensity data | Under 15% |
| Dashboard update latency after a scheduling decision | Under 2s (WebSocket push) |
| Demonstrable carbon savings vs. carbon-naive baseline, on replayed 24h data compressed into demo time | Clearly visible, ideally 15-30% or more |
| Live infra observability | Judges can run `docker ps` themselves and see it match the dashboard |

## 8. Assumptions

- An Electricity Maps free-tier API key is available (sign up early, do not block Week 1 on this).
- The team has access to a machine with Docker installed for the demo.
- An Anthropic Claude API key is available for the LLM narrative module.
- At least one team member with Docker/container-runtime experience owns the scheduling engine. See `02_Technical_Design.md §3.1` for why Docker was chosen over Kubernetes for this build.

## 9. Risks

The top risk is venue wifi or API failure during a live demo, mitigated by the simulation clock replaying cached historical data.
