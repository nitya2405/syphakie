import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.routing.scorer import score_model
from types import SimpleNamespace

# Simulate models with different cost/latency/quality profiles
models = {
    "cheap_slow":  SimpleNamespace(cost_per_unit=1,  avg_latency_ms=5000, quality_score=0.70),
    "mid_mid":     SimpleNamespace(cost_per_unit=15, avg_latency_ms=3000, quality_score=0.80),
    "pricey_fast": SimpleNamespace(cost_per_unit=40, avg_latency_ms=800,  quality_score=0.95),
}

max_cost    = max(float(m.cost_per_unit) for m in models.values())
max_latency = max(m.avg_latency_ms for m in models.values())

print(f"Weights: cost=0.4  latency=0.4  quality=0.2\n")

scores = {}
for name, model in models.items():
    s = score_model(model, max_cost, max_latency)
    scores[name] = s
    print(f"  {name:<15} score: {s:.4f}  "
          f"(cost={model.cost_per_unit}, latency={model.avg_latency_ms}ms, quality={model.quality_score})")

winner = max(scores, key=scores.get)
print(f"\n  Winner (balanced): {winner}")
print("\n--- Cost-heavy scenario (cost=0.7, latency=0.2, quality=0.1) ---")

from app.routing.config import RoutingConfig
RoutingConfig.AUTO_WEIGHTS = {"cost": 0.7, "latency": 0.2, "quality": 0.1}

scores2 = {}
for name, model in models.items():
    s = score_model(model, max_cost, max_latency)
    scores2[name] = s
    print(f"  {name:<15} score: {s:.4f}")

winner2 = max(scores2, key=scores2.get)
print(f"\n  Winner (cost-heavy): {winner2}")
