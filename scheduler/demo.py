"""
Walkthrough script for the scheduling engine.

Run: python -m scheduler.demo

Demonstrates the core scheduling invariant end to end:
  1. Dirty grid: a `flexible` job is submitted and deferred (no container created).
  2. Same dirty grid: a `critical` job is submitted and launches immediately.
  3. Grid turns clean: the previously deferred `flexible` job now launches.

Cross-check any step live with `docker ps` in another terminal.
"""
from .engine import SchedulingEngine
from .models import Job, PriorityTier

DIRTY_INTENSITY = 520  # gCO2/kWh, above the 400 threshold in policy.py
CLEAN_INTENSITY = 180  # gCO2/kWh, below the threshold


def show(label: str, jobs) -> None:
    print(f"\n--- {label} ---")
    for job in jobs:
        print(f"  {job.job_id:20s} tier={job.priority_tier.value:9s} status={job.status.value:9s} container={job.container_id}")


def main() -> None:
    engine = SchedulingEngine()

    flexible_job = Job(
        job_id="flex-report-01",
        namespace="team-a",
        priority_tier=PriorityTier.FLEXIBLE,
        image="alpine:latest",
        command="sleep 300",
    )
    critical_job = Job(
        job_id="crit-alert-01",
        namespace="team-a",
        priority_tier=PriorityTier.CRITICAL,
        image="alpine:latest",
        command="sleep 300",
    )

    print(f"Beat 1: submitting flexible job during a DIRTY grid ({DIRTY_INTENSITY} gCO2/kWh)")
    engine.submit(flexible_job)
    engine.tick(DIRTY_INTENSITY)
    show("After beat 1 (expect: deferred, no container)", engine.jobs.values())

    print(f"\nBeat 2: submitting critical job during the SAME dirty grid ({DIRTY_INTENSITY} gCO2/kWh)")
    engine.submit(critical_job)
    engine.tick(DIRTY_INTENSITY)
    show("After beat 2 (expect: critical running, flexible still deferred)", engine.jobs.values())

    input("\nCheck `docker ps` now: you should see only the critical container. Press Enter to continue...")

    print(f"\nBeat 3: grid turns CLEAN ({CLEAN_INTENSITY} gCO2/kWh), re-running scheduling tick")
    engine.tick(CLEAN_INTENSITY)
    show("After beat 3 (expect: flexible job now running too)", engine.jobs.values())

    input("\nCheck `docker ps` now: both containers should be visible. Press Enter to clean up...")

    for job in engine.jobs.values():
        if job.container_id:
            engine.docker_manager.stop(job.container_id)
    print("\nCleaned up demo containers.")


if __name__ == "__main__":
    main()
