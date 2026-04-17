"""
Populates model_registry with all supported models.
Run after: alembic upgrade head
Safe to re-run — skips existing entries.
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
from app.models.model_registry import ModelRegistry

MODELS = [
    dict(
        provider="openai", model_id="gpt-4o", modality="text",
        display_name="GPT-4o", cost_per_unit=0.005,
        unit_type="token", avg_latency_ms=900, quality_score=0.95,
    ),
    dict(
        provider="openai", model_id="gpt-3.5-turbo", modality="text",
        display_name="GPT-3.5 Turbo", cost_per_unit=0.001,
        unit_type="token", avg_latency_ms=400, quality_score=0.75,
    ),
    dict(
        provider="openai", model_id="dall-e-3", modality="image",
        display_name="DALL-E 3", cost_per_unit=40,
        unit_type="image", avg_latency_ms=5000, quality_score=0.92,
    ),
    dict(
        provider="openai", model_id="dall-e-2", modality="image",
        display_name="DALL-E 2", cost_per_unit=15,
        unit_type="image", avg_latency_ms=3000, quality_score=0.70,
    ),
    # Fal.ai — requires user-provided key
    dict(
        provider="fal", model_id="fal-ai/flux/schnell", modality="image",
        display_name="FLUX Schnell", cost_per_unit=10,
        unit_type="image", avg_latency_ms=2000, quality_score=0.80,
        requires_user_key=True,
    ),
    dict(
        provider="fal", model_id="fal-ai/flux/dev", modality="image",
        display_name="FLUX Dev", cost_per_unit=20,
        unit_type="image", avg_latency_ms=4000, quality_score=0.88,
        requires_user_key=True,
    ),
]


def seed():
    db = SessionLocal()
    added = 0
    for m in MODELS:
        exists = db.query(ModelRegistry).filter_by(
            provider=m["provider"], model_id=m["model_id"]
        ).first()
        if not exists:
            db.add(ModelRegistry(**m))
            added += 1
    db.commit()
    db.close()
    print(f"Seeded {added} model(s) into model_registry.")


if __name__ == "__main__":
    seed()
