# 02. Technical design

## 1. Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | Python 3.11 | Team's strongest shared language; fits forecasting/ML libraries natively |
| Backend framework | FastAPI | Async support (needed for WebSocket push and concurrent polling), auto-generated OpenAPI docs, low ceremony |
| Container runtime | Docker Engine (local) | The team has real, existing Docker experience, so this is the infra foundation it can move fastest and most confidently on (see decision note in §3.1) |
| Container control | `docker-py` SDK | Programmatic container create/start/stop/inspect from the scheduler engine |
| Scheduling engine | Custom Python scheduler loop (APScheduler-driven poll) | Owns the job queue and decides when and which container actually gets created; see §3.2 |
| Database | SQLite + SQLAlchemy | Zero-setup persistence appropriate for a single-machine demo, with a schema that's Postgres-portable if needed later |
| Forecasting | Prophet (fallback: weighted moving average with a seasonal blend) | See `06_AI_Module_Design.md` |
| LLM | Anthropic Claude API | Narrative report generation; see `06_AI_Module_Design.md` |
| Frontend | React (Vite) + Tailwind + Recharts | Fast to build a polished, real-time dashboard |
| Real-time transport | WebSocket (native FastAPI) | Sub-2s dashboard update latency target (PRD §7) |

## 2. Module boundaries (within the single backend process)

These are organized as clearly separated modules in one process (see `03_System_Architecture.md §3` for why not microservices):

```
greenops/
  scheduler/        # scheduling engine: job queue, defer/place decisions, docker-py calls
  policy/           # scheduling policy engine: pure functions, no I/O, fully unit-testable
  ingestion/        # carbon data ingestion service (live + replay)
  forecasting/      # Prophet + fallback model, training/eval
  budget/           # carbon budget service
  reporting/        # LLM reporting service + template fallback
  clock/            # simulation clock
  container_watch/  # Docker event/status watcher feeding WebSocket
  api/              # REST + WebSocket routes
  db/               # SQLAlchemy models + session management
```

`policy/` is intentionally the most isolated module, with no direct dependency on FastAPI, Docker, or the database. It's the core decision-making logic and has to be trivially unit-testable against constructed scenarios.

## 3. Key design decisions

### 3.1 Docker over Kubernetes

The original design used a Kubernetes-native scheduler extender, which is a valid pattern on its own. It was replaced once the team's actual skill profile was clear: near-zero prior Kubernetes experience against solid existing Docker experience. Kubernetes' scheduler extender mechanism (the webhook `Filter`/`Prioritize` contract, cluster bring-up, node labeling, RBAC, `kube-scheduler` config) is a genuinely advanced surface even for experienced Kubernetes users. Learning it from zero while also building the rest of the system in 2.5 weeks was the single largest risk to the project succeeding at all.

Docker keeps everything that actually matters for the demo's credibility (see §3.2) while turning the team's largest risk into its strongest asset. The differentiating logic (forecast-driven, multi-region, budget-aware scheduling) is unchanged. Only the underlying container substrate changed.

### 3.2 A real scheduling engine, not a fake queue

The scheduling engine is not a simulation. It holds real job requests in a queue, and a container is only actually started (`docker run`) the moment the policy engine approves it. Before that, the job genuinely has no running container, which is verifiable live via `docker ps` at any point during the demo. This is the same "prove it's real" property the Kubernetes design offered, just implemented directly instead of by intercepting a third-party scheduler.

### 3.3 Region simulation is logical

Regions are a label attached to a job at submission time (and passed to its container as an environment variable), used to select which carbon-intensity/forecast series governs its scheduling. All containers physically run on the one demo machine. This was equally true of the original `kind`-cluster design, which used node labels on a single local cluster rather than real geographically distributed hardware, so nothing about the project's honesty or ambition changes here.

### 3.4 Single-process monolith, not microservices

Given the timeline, network and deployment failures between services are a pure liability with no judge-visible benefit. The module boundaries above preserve the option to split later without incurring that cost now.

### 3.5 Simulation clock as a first-class abstraction

Every time-dependent module reads time from the clock, not `datetime.now()`, starting from day one. This is what makes the replay-at-speed demo mode possible without special-casing, and it directly addresses a real demo-visibility problem: carbon savings normally only show up over hours or days.

### 3.6 Fallback paths built alongside primary paths

Forecasting (Prophet, with a moving-average fallback) and LLM reporting (Claude, with a template fallback) both have a simple deterministic fallback built in the same work item as the primary path, not scheduled as later hardening. This is a direct response to the top demo risk: an external dependency failing during a live run.

## 4. Non-functional requirements

| Requirement | Target |
|---|---|
| Dashboard update latency after a scheduling event | Under 2s (WebSocket) |
| Scheduling decision latency (queue evaluation to container start) | Under 1s once approved |
| Critical-tier scheduling delay attributable to carbon policy | 0 (hard invariant, tested) |
| System must run demo end-to-end with no internet | Yes, via replay mode |
| Forecasting model MAPE | Under 15% |

## 5. Testing strategy

- Policy engine: unit tests against constructed scenarios, for example "dirty now, forecast clean in 1h, urgent deadline in 30min: schedule now anyway."
- Critical-tier invariant: an explicit test asserting zero deferral regardless of carbon or budget state. This is a correctness guarantee and should be tested like one.
- Scheduling engine wiring: an integration test against real Docker that submits a job and asserts the container is or isn't created at the expected time, per the policy outcome, verified via `docker-py` inspect calls in the test itself rather than logs.
- Forecast accuracy: held-out evaluation against real collected historical data (see `06_AI_Module_Design.md §1.4`).
- End-to-end rehearsal runs: a component isn't done until it's been exercised in a full run, not just isolated tests.
