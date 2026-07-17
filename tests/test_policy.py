from scheduler.models import Job, PriorityTier
from scheduler.policy import DIRTY_THRESHOLD_GCO2_KWH, should_launch


def make_job(tier: PriorityTier) -> Job:
    return Job(job_id="test-job", namespace="test", priority_tier=tier, image="alpine:latest")


def test_critical_launches_regardless_of_carbon_intensity():
    job = make_job(PriorityTier.CRITICAL)
    assert should_launch(job, carbon_intensity=DIRTY_THRESHOLD_GCO2_KWH + 500) is True


def test_flexible_defers_above_threshold():
    job = make_job(PriorityTier.FLEXIBLE)
    assert should_launch(job, carbon_intensity=DIRTY_THRESHOLD_GCO2_KWH + 1) is False


def test_flexible_launches_below_threshold():
    job = make_job(PriorityTier.FLEXIBLE)
    assert should_launch(job, carbon_intensity=DIRTY_THRESHOLD_GCO2_KWH - 1) is True


def test_standard_follows_same_threshold_as_flexible():
    job = make_job(PriorityTier.STANDARD)
    assert should_launch(job, carbon_intensity=DIRTY_THRESHOLD_GCO2_KWH + 1) is False
    assert should_launch(job, carbon_intensity=DIRTY_THRESHOLD_GCO2_KWH - 1) is True
