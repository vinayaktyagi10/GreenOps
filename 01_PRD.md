# 01 — Product Requirements Document (PRD)

**Project:** GreenOps — Carbon-Aware Container Scheduler
**Event:** SYNERGY 2026 Innovation & Career Summit — HPE Hackathon (Problem Statement 01)
**Grand Finale demo:** 31 July 2026

---

## 1. Problem Statement

Electricity grids vary significantly in carbon intensity throughout the day and across regions, depending on the live mix of renewable vs. non-renewable generation. Compute infrastructure today is scheduled with zero awareness of this — a batch job run at 2pm on a coal-heavy grid emits far more CO2 than the identical job run at 2am on a wind-heavy grid, or run in a different region entirely. There is no widely deployed, easy-to-adopt mechanism that makes carbon intensity a first-class scheduling signal alongside CPU/memory.

## 2. Goal

Build a **real, working carbon-aware scheduling engine** that defers and places non-urgent containerized workloads based on live and forecasted grid carbon intensity — across both **time** (defer to a cleaner hour) and **space** (place in a cleaner region) — and prove the resulting carbon savings with a live, credible dashboard and demo.

This is not a simulation of scheduling. Real Docker containers are genuinely deferred (they do not exist until the policy approves them) and placed by a real scheduling engine.

## 3. Why This Wins (Positioning)

- **On-brand for HPE**: HPE's GreenLake and sustainability commitments center on making infrastructure decisions carbon- and cost-aware. This project speaks HPE's own strategic language.
- **Differentiated from likely competitors**: most teams building "carbon-aware scheduling" will build a toy job queue with an if-statement that just flips a status flag. We build a real scheduling engine where containers structurally do not exist until approved (verifiable live via `docker ps`), with a spatial (multi-region) dimension most public examples don't attempt.
- **Technically deep enough for HPE engineers to respect**: a real scheduling engine, a forecasting model, an LLM reporting layer, and a FinOps-style carbon budget system — enough surface area to have a substantive technical conversation with judges, not just a demo click-through.

## 4. Target Users (in the enterprise, hypothetically)

- **Platform/Infra teams** who want to reduce the carbon footprint of batch/non-urgent workloads without manual intervention.
- **Sustainability/FinOps teams** who need auditable reporting on carbon impact and budget compliance per team/namespace.
- **On-call/SRE teams** who need urgent workloads to always bypass carbon-aware deferral (correctness/availability must never be sacrificed for sustainability).

## 5. Scope

### In scope (v1 — hackathon build)
1. A Docker-based Scheduling Engine that owns a real job queue and only creates a container when its policy approves the job (see `03_System_Architecture.md`).
2. Priority-tiered workload model: `critical` (never deferred, always scheduled immediately), `standard` (deferred within a bounded SLA window), `flexible` (deferred aggressively for max carbon savings).
3. Live + historical carbon intensity ingestion from the Electricity Maps API, for at least 3 simulated regions.
4. A forecasting model predicting next-24h carbon intensity per region.
5. Scheduling policy that combines current + forecasted carbon intensity, workload priority tier, and per-namespace carbon budget to decide *when* and *in which region* to run a container.
6. A carbon budget system: each namespace/team has a carbon budget; the dashboard shows budget burn-down and the scheduler can be configured to hard-enforce budgets for `flexible` tier workloads.
7. An LLM-generated plain-English sustainability report summarizing scheduling decisions and savings over a period.
8. A live React dashboard: region view, carbon intensity + forecast charts, job/container timeline (scheduled vs. deferred vs. running), cumulative carbon and cost savings, budget burn-down, LLM report panel.
9. A **simulation clock** allowing the whole system to run against replayed historical carbon data at accelerated speed, for demo reliability independent of venue wifi/live API availability.

### Out of scope (v1)
- Multi-host/distributed Docker (single demo machine with simulated multi-region carbon signals is sufficient — see `02_Technical_Design.md §3.3`).
- Real cost billing integration (cost savings are estimated, not billed).
- Authentication/multi-tenant user accounts (namespace = team proxy is sufficient for the demo).
- Production-grade HA of the scheduling engine itself.

## 6. Key User Stories

- As a platform engineer, I submit a workload with a priority tier and deadline, and the scheduler defers/places it according to live+forecasted carbon intensity, without me doing anything else.
- As a sustainability lead, I open the dashboard and see, for the last N hours, how much CO2 (and estimated cost) was saved versus a carbon-naive baseline scheduler.
- As a team lead, I see my namespace's carbon budget burn-down and get flagged before I exceed it.
- As an SRE, I confirm that `critical`-tier workloads are never delayed by the carbon-aware policy, regardless of grid conditions.
- As an HPE judge, I watch a live demo where submitting workloads visibly get deferred/placed differently as I change the simulated carbon signal, and see the dashboard update in real time.

## 7. Success Metrics (for the demo, not production)

| Metric | Target |
|---|---|
| Real containers actually deferred/placed by the scheduling engine (not mocked) | 100% of `standard`/`flexible` tier jobs |
| Critical-tier jobs delayed by carbon policy | 0 |
| Forecasting model MAPE on held-out carbon intensity data | < 15% |
| Dashboard update latency after a scheduling decision | < 2s (WebSocket push) |
| Demonstrable carbon savings vs. carbon-naive baseline, on replayed 24h data compressed into demo time | Clearly visible, ideally 15–30%+ |
| Live infra observability | Judges can run `docker ps` themselves and see it match the dashboard |

## 8. Assumptions

- Electricity Maps free-tier API key is available (sign up early — do not block Week 1 on this).
- Team has access to a machine with Docker installed for the demo.
- Anthropic Claude API key is available for the LLM narrative module.
- Team composition: ~4 people; at least one (infra-strong, Docker-experienced) owns the Scheduling Engine — see `02_Technical_Design.md §3.1` for why Docker was chosen over Kubernetes given the team's actual skill profile, and `08_Development_Plan.md` for role split.

## 9. Risks

See `08_Development_Plan.md §Risk Register` for full detail. Top risk: venue wifi/API failure during live demo — mitigated by the simulation clock replaying cached historical data.
