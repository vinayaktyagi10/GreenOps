# GreenOps

A carbon-aware container scheduler. It defers or places containerized workloads
based on live and forecasted grid carbon intensity, across both time (run later,
when the grid is cleaner) and space (run in a cleaner region), with priority
tiers that guarantee urgent work is never delayed by sustainability policy.

Unlike a scheduler that just flips a status flag, containers here structurally
do not exist until the scheduling policy approves them: nothing is created via
the Docker API until a job clears its policy check. This is independently
verifiable with `docker ps`.

## Design documents

Full product, architecture, database, API, AI module, and UI/UX specs live in
[`docs/`](docs/). Start with [`docs/01_PRD.md`](docs/01_PRD.md) and
[`docs/02_Technical_Design.md`](docs/02_Technical_Design.md).

## Project layout

```
scheduler/
  models.py          job and priority-tier data model
  policy.py           scheduling policy (approve/defer decision)
  docker_manager.py   Docker Engine integration (docker-py)
  engine.py            scheduling loop tying policy to container lifecycle
  demo.py             end-to-end walkthrough script
tests/                unit tests (no Docker daemon required)
```

## Requirements

- Python 3.10+
- Docker Engine running locally (for `scheduler.demo`; not required to run the test suite)

## Setup

```
pip install -r requirements-dev.txt
```

## Running the tests

```
pytest
```

## Running the scheduling engine walkthrough

Requires a running Docker daemon and the `alpine:latest` image pulled locally.

```
docker pull alpine:latest
python -m scheduler.demo
```

This submits a low-priority job during a simulated high-carbon period (deferred,
no container created), submits a critical-priority job in the same conditions
(launched immediately), then simulates the grid turning clean and shows the
deferred job launch. Cross-check any step with `docker ps` in another terminal.
