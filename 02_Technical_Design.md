# 02 — Technical Design

## 1. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | Python 3.11 | Team's strongest shared language; fits forecasting/ML libraries natively |
| Backend framework | FastAPI | Async support (needed for WebSocket push + concurrent polling), auto-generated OpenAPI docs, low ceremony |
| Container runtime | Docker Engine (local) | Team has real, existing Docker experience — this is the infra foundation the team can move fastest and most confidently on (see decision note in §3.1) |
| Container control | `docker-py` SDK | Programmatic container create/start/stop/inspect from the scheduler engine |
| Scheduling engine | Custom Python scheduler loop (APScheduler-driven poll) | Owns the job queue and decides when/which container actually gets created — see §3.2 |
| Database | SQLite + SQLAlchemy | Zero-setup persistence appropriate for a single-machine demo; Postgres-portable schema if ever needed |
| Forecasting | Prophet (fallback: weighted moving average + seasonal blend) | See `06_AI_Module_Design.md` |
| LLM | Anthropic Claude API | Narrative report generation, see `06_AI_Module_Design.md` |
| Frontend | React (Vite) + Tailwind + Recharts | Fast to build a polished, real-time dashboard |
| Real-time transport | WebSocket (native FastAPI) | Sub-2s dashboard update latency target (PRD §7) |

## 2. Module Boundaries (within the single backend process)

Deliberately organized as clearly-separated modules in one process (see `03_System_Architecture.md §3` for why not microservices):

```
greenops/
  scheduler/       # Carbon-Aware Scheduling Engine — job queue, defer/place decisions, docker-py calls
  policy/          # Scheduling Policy Engine — pure functions, no I/O, fully unit-testable
  ingestion/        # Carbon Data Ingestion Service (live + replay)
  forecasting/      # Prophet + fallback model, training/eval
  budget/           # Carbon Budget Service
  reporting/        # LLM Reporting Service + template fallback
  clock/            # Simulation Clock
  container_watch/  # Docker event/status watcher feeding WebSocket
  api/              # REST + WebSocket routes
  db/               # SQLAlchemy models + session management
```

`policy/` is intentionally the most isolated module — no direct dependency on FastAPI, Docker, or the database — because it is the core decision-making logic and must be trivially unit-testable against constructed scenarios (per `08_Development_Plan.md` Week 2 exit criteria).

## 3. Key Design Decisions & Rationale

### 3.1 Docker over Kubernetes — an explicit, deliberate scope decision
A Kubernetes-native scheduler extender was the original design (still a valid pattern), but was replaced after the team's actual skill profile was clarified: near-zero prior Kubernetes experience versus solid existing Docker experience. Kubernetes' scheduler extender mechanism (webhook `Filter`/`Prioritize` contract, cluster bring-up, node labeling, RBAC, `kube-scheduler` config) is a genuinely advanced surface even for experienced K8s users — attempting to learn it from zero *and* build the rest of the system in 2.5 weeks was assessed as the single largest risk to the project succeeding at all. Docker preserves everything that actually matters for the demo's credibility (see §3.2) while converting the team's largest risk into its strongest asset. **This is not a simplification of ambition — the differentiating logic (forecast-driven, multi-region, budget-aware scheduling) is unchanged; only the underlying container substrate changed.**

### 3.2 A real scheduling engine over a fake queue
The Scheduling Engine is not a simulation: it holds real job requests in a queue, and a container is only actually `docker run` at the moment the Policy Engine approves it. Before that moment, the job genuinely does not have a running container — this is verifiable live via `docker ps` at any point during the demo, which is the same "prove it's real" property the Kubernetes design offered, just implemented directly instead of by intercepting a third-party scheduler.

### 3.3 Region simulation is logical, same as the K8s design would have been
Regions are a label/tag attached to a job at submission time (and passed to its container as an env var), used purely to select which carbon-intensity/forecast series governs its scheduling. All containers physically run on the one demo machine — this was equally true of the original `kind`-cluster design (node labels on a single local cluster, not real geographically distributed hardware), so nothing about the project's honesty or ambition changes here.

### 3.4 Single-process monolith, not microservices
Given the timeline, network/deployment failures between services are a pure liability with no judge-visible benefit. Clean module boundaries preserve the *option* to split later without incurring the cost now.

### 3.5 Simulation Clock as a first-class abstraction (not a special demo-mode hack bolted on later)
Every time-dependent module reads time from the Clock, not `datetime.now()`, from day 1. This is what makes the replay-at-speed demo mode possible without special-casing — and directly addresses the demo-visibility risk flagged during planning (carbon savings normally only show up over hours/days).

### 3.6 Fallback paths built alongside primary paths, not after
Forecasting (Prophet → moving-average fallback) and LLM reporting (Claude → template fallback) both have a simple deterministic fallback built in the same work item as the primary path, not scheduled as later hardening. This is a direct response to the top demo risk (external dependency failure live) — see Risk Register in `08_Development_Plan.md`.

## 4. Non-Functional Requirements

| Requirement | Target |
|---|---|
| Dashboard update latency after a scheduling event | < 2s (WebSocket) |
| Scheduling decision latency (queue evaluation to container start) | < 1s once approved |
| Critical-tier scheduling delay attributable to carbon policy | 0 (hard invariant, tested) |
| System must run demo end-to-end with no internet | Yes, via replay mode |
| Forecasting model MAPE | < 15% |

## 5. Testing Strategy

- **Policy Engine**: unit tests against constructed scenarios (e.g. "dirty now, forecast clean in 1h, urgent deadline in 30min → schedule now anyway").
- **Critical-tier invariant**: explicit test asserting zero deferral regardless of carbon/budget state — this is a correctness guarantee, not just a feature, and should be tested like one.
- **Scheduling engine wiring**: integration test against real Docker (submit a job, assert the container is/isn't created at the expected time, per policy outcome — verified via `docker-py` inspect calls in the test itself, not just logs).
- **Forecast accuracy**: held-out evaluation against real collected historical data (see `06_AI_Module_Design.md §1.4`).
- **End-to-end rehearsal runs**: per `08_Development_Plan.md §4`, a component isn't done until exercised in a full run, not just isolated tests.
