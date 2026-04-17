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
    # ── OpenAI — Text (user key required) ──────────────────────────────────
    dict(
        provider="openai", model_id="gpt-4o", modality="text",
        display_name="GPT-4o", cost_per_unit=0.005,
        unit_type="token", avg_latency_ms=900, quality_score=0.95,
        requires_user_key=True,
    ),
    dict(
        provider="openai", model_id="gpt-4o-mini", modality="text",
        display_name="GPT-4o Mini", cost_per_unit=0.00015,
        unit_type="token", avg_latency_ms=500, quality_score=0.80,
        requires_user_key=True,
    ),
    dict(
        provider="openai", model_id="gpt-3.5-turbo", modality="text",
        display_name="GPT-3.5 Turbo", cost_per_unit=0.001,
        unit_type="token", avg_latency_ms=400, quality_score=0.75,
        requires_user_key=True,
    ),
    # ── OpenAI — Image (user key required) ─────────────────────────────────
    dict(
        provider="openai", model_id="dall-e-3", modality="image",
        display_name="DALL-E 3", cost_per_unit=40,
        unit_type="image", avg_latency_ms=5000, quality_score=0.92,
        requires_user_key=True,
    ),
    dict(
        provider="openai", model_id="dall-e-2", modality="image",
        display_name="DALL-E 2", cost_per_unit=15,
        unit_type="image", avg_latency_ms=3000, quality_score=0.70,
        requires_user_key=True,
    ),
    # ── Stability AI — Image (user key required) ────────────────────────────
    dict(
        provider="stability", model_id="stability-ai/stable-image-core", modality="image",
        display_name="Stable Image Core", cost_per_unit=3,
        unit_type="image", avg_latency_ms=6000, quality_score=0.85,
        requires_user_key=True,
    ),
    dict(
        provider="stability", model_id="stability-ai/stable-image-ultra", modality="image",
        display_name="Stable Image Ultra", cost_per_unit=8,
        unit_type="image", avg_latency_ms=9000, quality_score=0.91,
        requires_user_key=True,
    ),
    dict(
        provider="stability", model_id="stability-ai/sd3-medium", modality="image",
        display_name="Stable Diffusion 3 Medium", cost_per_unit=4,
        unit_type="image", avg_latency_ms=7000, quality_score=0.87,
        requires_user_key=True,
    ),
    # ── Fal.ai — Image (user key required) ─────────────────────────────────
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
    dict(
        provider="fal", model_id="fal-ai/flux-pro/v1.1", modality="image",
        display_name="FLUX 1.1 Pro", cost_per_unit=40,
        unit_type="image", avg_latency_ms=6000, quality_score=0.93,
        requires_user_key=True,
    ),
    dict(
        provider="fal", model_id="fal-ai/ideogram/v3", modality="image",
        display_name="Ideogram V3", cost_per_unit=50,
        unit_type="image", avg_latency_ms=8000, quality_score=0.90,
        requires_user_key=True,
    ),
    dict(
        provider="fal", model_id="fal-ai/ideogram/v2", modality="image",
        display_name="Ideogram V2", cost_per_unit=35,
        unit_type="image", avg_latency_ms=6000, quality_score=0.85,
        requires_user_key=True,
    ),
    dict(
        provider="fal", model_id="fal-ai/recraft-v3", modality="image",
        display_name="Recraft V3", cost_per_unit=40,
        unit_type="image", avg_latency_ms=5000, quality_score=0.88,
        requires_user_key=True,
    ),
    dict(
        provider="fal", model_id="fal-ai/luma-photon", modality="image",
        display_name="Luma Photon", cost_per_unit=30,
        unit_type="image", avg_latency_ms=5000, quality_score=0.83,
        requires_user_key=True,
    ),
    dict(
        provider="fal", model_id="fal-ai/hyper-sdxl", modality="image",
        display_name="Hyper SDXL", cost_per_unit=8,
        unit_type="image", avg_latency_ms=3000, quality_score=0.79,
        requires_user_key=True,
    ),
    dict(
        provider="fal", model_id="fal-ai/aura-flow", modality="image",
        display_name="AuraFlow", cost_per_unit=12,
        unit_type="image", avg_latency_ms=4000, quality_score=0.81,
        requires_user_key=True,
    ),
    dict(
        provider="fal", model_id="fal-ai/stable-diffusion-v3-medium", modality="image",
        display_name="Stable Diffusion 3 (Fal)", cost_per_unit=15,
        unit_type="image", avg_latency_ms=7000, quality_score=0.84,
        requires_user_key=True,
    ),
    # ── Anthropic — Text (user key required) ────────────────────────────────
    dict(
        provider="anthropic", model_id="claude-3-5-sonnet-20241022", modality="text",
        display_name="Claude 3.5 Sonnet", cost_per_unit=0.003,
        unit_type="token", avg_latency_ms=1200, quality_score=0.96,
        requires_user_key=True,
    ),
    dict(
        provider="anthropic", model_id="claude-3-5-haiku-20241022", modality="text",
        display_name="Claude 3.5 Haiku", cost_per_unit=0.0008,
        unit_type="token", avg_latency_ms=600, quality_score=0.82,
        requires_user_key=True,
    ),
    dict(
        provider="anthropic", model_id="claude-3-haiku-20240307", modality="text",
        display_name="Claude 3 Haiku", cost_per_unit=0.00025,
        unit_type="token", avg_latency_ms=500, quality_score=0.78,
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
