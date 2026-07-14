# 08 — Development Plan

**Window:** 14 July 2026 (selection) → 31 July 2026 (Grand Finale). ~2.5 weeks.
**Assumed team:** 4 people. Roles assigned by stated strength (infra-strong member owns the highest-differentiation component, built on Docker — see `02_Technical_Design.md §3.1` for why Docker was chosen over Kubernetes given the team's actual skill profile).

## 1. Roles

| Role | Owns |
|---|---|
| **Infra/Scheduling Lead** | Scheduling Engine, Docker integration (`docker-py`), region tagging, Docker event watcher for dashboard |
| **Backend/Data Lead** | FastAPI app skeleton, SQLite schema + SQLAlchemy models, Carbon Ingestion Service, Simulation Clock, REST + WebSocket API |
| **ML Lead** | Forecasting model (Prophet + fallback), Policy Engine scoring logic, evaluation/tuning against replayed data |
| **Frontend/Integration Lead** | React dashboard, LLM Reporting Service integration, demo script rehearsal coordination |

All roles overlap on integration points — this table is primary ownership, not exclusive responsibility.

## 2. Milestones

### Week 1 (14–20 Jul): Foundations — de-risk the two things that block everything else
- **Day 1 (critical, do not delay):** Electricity Maps API signup; identify 3 real zones to map to simulated regions; start historical data collection/backfill immediately (forecasting needs history — the earlier this starts, the better the model).
- **Day 1-2:** Anthropic Claude API key provisioned.
- FastAPI skeleton + SQLite schema (`04_Database_Design.md`) migrated and seeded.
- Scheduling Engine skeleton: job queue model + `docker-py` wired up to actually create/start/stop containers for a hardcoded test job (prove the plumbing works end-to-end before adding any policy logic).
- Carbon Ingestion Service: live-mode polling working against real Electricity Maps API.
- **Exit criteria:** a manually-submitted test job actually results in a real Docker container being created and observable via `docker ps` (no-op policy, i.e. always-approve). Real historical carbon data collection is running in the background continuously from this point on.

### Week 2 (21–27 Jul): Core logic
- Policy Engine: scoring function combining current + forecast + budget + urgency; unit-tested against constructed scenarios (not yet live).
- Forecasting model trained on collected historical data (fallback model first, Prophet as upgrade); evaluate MAPE.
- Scheduling Engine wired to Policy Engine: `standard`/`flexible` tier jobs actually deferred (container genuinely not created until approved) or placed in the chosen region tag; `critical` tier invariant enforced and tested explicitly (always launches immediately).
- Carbon Budget Service: budget tracking + enforcement for `flexible` tier.
- Simulation Clock built; replay mode working against collected historical data; scheduling ticks driven by the Clock, not wall-clock.
- Backend REST + WebSocket API complete per `05_API_Specification.md`.
- Frontend: region strip, savings panel, job timeline built against real API (build order per `07_UI_UX_Design.md §4`).
- **Exit criteria:** a full end-to-end run in replay mode — submit jobs across all 3 tiers, watch them get deferred/placed/scheduled correctly (containers really appear/disappear via `docker ps` in step with the decisions), dashboard reflects it live — works without manual intervention.

### Week 3 (28–31 Jul): Polish, rehearsal, and the report layer
- LLM Reporting Service integrated (with template fallback tested).
- Container cross-check view + decision detail drill-down.
- Policy weight tuning pass: run replayed data through the system, adjust `w1/w2/w3` (see `06_AI_Module_Design.md §1.6`) until decisions are clearly sensible and savings are visibly strong for the demo dataset.
- **Full dry-run rehearsals** (at least 2, on the actual demo machine/network if possible): run the exact demo script end to end, timed.
- Prepare fallback plan for every live-demo dependency (see Risk Register).
- Freeze scope by 30 Jul evening — no new features day-of.

## 3. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Electricity Maps historical data insufficient for forecasting | Medium | High | Start collection Day 1; fallback moving-average model needs less history than Prophet; synthesize realistic seasonal data as backup, clearly labeled |
| Venue wifi fails during live demo | Medium | High | Simulation Clock + replay mode makes the entire demo independent of live network/API access |
| Claude API unavailable/rate-limited live | Low | Medium | Template-based fallback narrative, built alongside the LLM path from Week 2, not bolted on later |
| Prophet fails to converge / install issues | Medium | Low | Fallback moving-average model is the default; Prophet is an upgrade, not a dependency |
| Scope creep beyond what's rehearsed | Medium | High | Hard feature freeze 30 Jul evening; anything not in a rehearsed run does not go in the demo |
| Team member unavailable during crunch | Low | Medium | Role overlap (table above) — no component has a single point of failure on knowledge |
| Judges assume "just Docker" is less impressive than Kubernetes | Low | Medium | Lead the demo narrative with the policy/forecasting sophistication and the "containers genuinely don't exist until approved" property, not the orchestration substrate — the intelligence is the pitch, not the container runtime |

## 4. Definition of Done (per component)

A component is "done" only when it has been exercised in at least one full end-to-end rehearsal run, not merely unit-tested in isolation — this project's credibility rests on live, observable behavior (`docker ps`/`docker logs`-verifiable), so integration is part of the definition of done, not a follow-up step.

## 5. Demo Script (rehearsed, ~7-8 minutes)

1. (30s) Problem framing — carbon intensity varies by time and region; infra today ignores this.
2. (1 min) Show architecture at a glance — a real scheduling engine making real container placement/deferral decisions, not a simulation.
3. (2 min) Replay mode: 24h compressed — narrate the timeline panel as jobs get deferred/placed, savings accumulate.
4. (1.5 min) Live interaction: submit a `flexible` job and a `critical` job simultaneously during a "dirty" window — show critical launches immediately, flexible defers; cross-check with `docker ps` that the flexible job's container genuinely does not exist yet.
5. (1 min) Budget burn-down + what happens when a namespace nears its cap.
6. (1 min) Generate the LLM report live.
7. (30s) Close — recap savings numbers, mention forecasting-driven, dual time+region decisions as the key differentiator.
