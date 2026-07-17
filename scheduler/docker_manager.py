import docker

from .models import Job

REGION_LABEL_PREFIX = "greenops.region"


class DockerManager:
    """Thin wrapper around docker-py. This is the only place that talks to the Docker Engine."""

    def __init__(self):
        self.client = docker.from_env()

    def launch(self, job: Job) -> str:
        """Creates and starts a real container for this job. Called only after policy approval."""
        container = self.client.containers.run(
            image=job.image,
            command=job.command,
            detach=True,
            labels={REGION_LABEL_PREFIX: job.region_tag, "greenops.job_id": job.job_id, "greenops.namespace": job.namespace},
            name=f"greenops-{job.job_id}",
        )
        return container.id

    def stop(self, container_id: str) -> None:
        container = self.client.containers.get(container_id)
        container.stop()
        container.remove()

    def list_managed(self, region_tag: str | None = None):
        filters = {"label": REGION_LABEL_PREFIX}
        containers = self.client.containers.list(filters=filters)
        if region_tag:
            containers = [c for c in containers if c.labels.get(REGION_LABEL_PREFIX) == region_tag]
        return containers
