from .docker_manager import DockerManager
from .models import Job, JobStatus
from .policy import should_launch


class SchedulingEngine:
    """Owns the job queue. A job's container is only ever created here, and only
    once the policy approves it. Nothing upstream can create a container directly."""

    def __init__(self, docker_manager: DockerManager | None = None):
        self.docker_manager = docker_manager or DockerManager()
        self.jobs: dict[str, Job] = {}

    def submit(self, job: Job) -> None:
        self.jobs[job.job_id] = job

    def tick(self, carbon_intensity: float) -> list[Job]:
        """One scheduling pass: evaluate every pending/deferred job against the current
        carbon reading and launch the ones the policy approves. Returns jobs launched this tick."""
        launched = []
        for job in self.jobs.values():
            if job.status not in (JobStatus.PENDING, JobStatus.DEFERRED):
                continue
            if should_launch(job, carbon_intensity):
                job.container_id = self.docker_manager.launch(job)
                job.status = JobStatus.RUNNING
                launched.append(job)
            else:
                job.status = JobStatus.DEFERRED
                job.defer_count += 1
        return launched
