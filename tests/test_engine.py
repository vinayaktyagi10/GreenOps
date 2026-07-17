from scheduler.engine import SchedulingEngine
from scheduler.models import Job, JobStatus, PriorityTier


class FakeDockerManager:
    """Records launch/stop calls without touching a real Docker daemon."""

    def __init__(self):
        self.launched = []
        self.stopped = []
        self._next_id = 0

    def launch(self, job: Job) -> str:
        self._next_id += 1
        container_id = f"fake-container-{self._next_id}"
        self.launched.append((job.job_id, container_id))
        return container_id

    def stop(self, container_id: str) -> None:
        self.stopped.append(container_id)

    def list_managed(self, region_tag=None):
        return []


def make_job(job_id: str, tier: PriorityTier) -> Job:
    return Job(job_id=job_id, namespace="test", priority_tier=tier, image="alpine:latest")


def test_flexible_job_deferred_on_dirty_grid():
    engine = SchedulingEngine(docker_manager=FakeDockerManager())
    job = make_job("flex-1", PriorityTier.FLEXIBLE)
    engine.submit(job)

    engine.tick(carbon_intensity=520)

    assert job.status == JobStatus.DEFERRED
    assert job.container_id is None
    assert engine.docker_manager.launched == []


def test_critical_job_launches_immediately_on_dirty_grid():
    engine = SchedulingEngine(docker_manager=FakeDockerManager())
    job = make_job("crit-1", PriorityTier.CRITICAL)
    engine.submit(job)

    engine.tick(carbon_intensity=520)

    assert job.status == JobStatus.RUNNING
    assert job.container_id is not None


def test_deferred_job_launches_once_grid_turns_clean():
    engine = SchedulingEngine(docker_manager=FakeDockerManager())
    job = make_job("flex-1", PriorityTier.FLEXIBLE)
    engine.submit(job)

    engine.tick(carbon_intensity=520)
    assert job.status == JobStatus.DEFERRED

    engine.tick(carbon_intensity=180)
    assert job.status == JobStatus.RUNNING
    assert job.container_id is not None


def test_running_job_is_not_reevaluated_on_subsequent_ticks():
    docker_manager = FakeDockerManager()
    engine = SchedulingEngine(docker_manager=docker_manager)
    job = make_job("crit-1", PriorityTier.CRITICAL)
    engine.submit(job)

    engine.tick(carbon_intensity=520)
    engine.tick(carbon_intensity=520)

    assert len(docker_manager.launched) == 1
