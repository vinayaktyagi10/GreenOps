from .models import Job, PriorityTier

# gCO2/kWh cutoff above which the grid is considered "dirty". A simple threshold
# rule; the forecast-weighted score in docs/06_AI_Module_Design.md §1.6 replaces this.
DIRTY_THRESHOLD_GCO2_KWH = 400


def should_launch(job: Job, carbon_intensity: float) -> bool:
    """critical always launches; standard/flexible only launch below the dirty threshold."""
    if job.priority_tier == PriorityTier.CRITICAL:
        return True
    return carbon_intensity < DIRTY_THRESHOLD_GCO2_KWH
