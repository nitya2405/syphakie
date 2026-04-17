from app.routing.config import RoutingConfig


def score_model(model, max_cost: float, max_latency: int) -> float:
    """
    Returns a score between 0.0 and 1.0.
    Higher is better. Weights come from RoutingConfig.AUTO_WEIGHTS.
    """
    weights = RoutingConfig.AUTO_WEIGHTS

    # Normalize: lower cost = higher score
    cost_score = 1.0 - (float(model.cost_per_unit) / max_cost) if max_cost > 0 else 1.0

    # Normalize: lower latency = higher score
    latency = model.avg_latency_ms or max_latency  # treat None as worst case
    latency_score = 1.0 - (latency / max_latency) if max_latency > 0 else 1.0

    # Quality score: already 0.0–1.0, use 0.5 if not set
    quality_score = float(model.quality_score) if model.quality_score is not None else 0.5

    return (
        weights["cost"]    * cost_score +
        weights["latency"] * latency_score +
        weights["quality"] * quality_score
    )
