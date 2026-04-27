"""
Populates model_registry with all supported models.
Run after: alembic upgrade head
Safe to re-run — upserts by (provider, model_id).
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
from app.models.model_registry import ModelRegistry

MODELS = [
    # ══════════════════════════════════════════════════════════════════
    # OPENAI
    # ══════════════════════════════════════════════════════════════════
    dict(provider="openai", model_id="gpt-4o", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="GPT-4o", cost_per_unit=0.005, unit_type="token",
         avg_latency_ms=900, quality_score=0.95, requires_user_key=False),
    dict(provider="openai", model_id="gpt-4o-mini", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="GPT-4o Mini", cost_per_unit=0.00015, unit_type="token",
         avg_latency_ms=500, quality_score=0.80, requires_user_key=False),
    dict(provider="openai", model_id="gpt-4-turbo", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="GPT-4 Turbo", cost_per_unit=0.01, unit_type="token",
         avg_latency_ms=1500, quality_score=0.93, requires_user_key=False),
    dict(provider="openai", model_id="gpt-3.5-turbo", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="GPT-3.5 Turbo", cost_per_unit=0.001, unit_type="token",
         avg_latency_ms=400, quality_score=0.75, requires_user_key=False),
    dict(provider="openai", model_id="dall-e-3", modality="image", task_type="text_to_image",
         task_types=["text_to_image"],
         display_name="DALL-E 3", cost_per_unit=40, unit_type="image",
         avg_latency_ms=5000, quality_score=0.92, requires_user_key=False),
    dict(provider="openai", model_id="dall-e-2", modality="image", task_type="text_to_image",
         task_types=["text_to_image"],
         display_name="DALL-E 2", cost_per_unit=15, unit_type="image",
         avg_latency_ms=3000, quality_score=0.70, requires_user_key=False),
    dict(provider="openai", model_id="tts-1", modality="audio", task_type="text_to_speech",
         task_types=["text_to_speech"],
         display_name="TTS-1", cost_per_unit=0.015, unit_type="character",
         avg_latency_ms=1000, quality_score=0.85, requires_user_key=False),
    dict(provider="openai", model_id="tts-1-hd", modality="audio", task_type="text_to_speech",
         task_types=["text_to_speech"],
         display_name="TTS-1 HD", cost_per_unit=0.030, unit_type="character",
         avg_latency_ms=2000, quality_score=0.92, requires_user_key=False),
    dict(provider="openai", model_id="whisper-1", modality="audio", task_type="speech_to_text",
         task_types=["speech_to_text"],
         display_name="Whisper", cost_per_unit=0.006, unit_type="minute",
         avg_latency_ms=3000, quality_score=0.92, requires_user_key=False,
         is_active=True),

    # ══════════════════════════════════════════════════════════════════
    # ANTHROPIC
    # ══════════════════════════════════════════════════════════════════
    dict(provider="anthropic", model_id="claude-opus-4-5", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Claude Opus 4.5", cost_per_unit=0.015, unit_type="token",
         avg_latency_ms=1800, quality_score=0.98, requires_user_key=False),
    dict(provider="anthropic", model_id="claude-sonnet-4-5", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Claude Sonnet 4.5", cost_per_unit=0.003, unit_type="token",
         avg_latency_ms=900, quality_score=0.95, requires_user_key=False),
    dict(provider="anthropic", model_id="claude-3-5-sonnet-20241022", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Claude 3.5 Sonnet", cost_per_unit=0.003, unit_type="token",
         avg_latency_ms=1200, quality_score=0.96, requires_user_key=False),
    dict(provider="anthropic", model_id="claude-3-5-haiku-20241022", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Claude 3.5 Haiku", cost_per_unit=0.0008, unit_type="token",
         avg_latency_ms=600, quality_score=0.82, requires_user_key=False),
    dict(provider="anthropic", model_id="claude-3-haiku-20240307", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Claude 3 Haiku", cost_per_unit=0.00025, unit_type="token",
         avg_latency_ms=500, quality_score=0.78, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # GOOGLE
    # ══════════════════════════════════════════════════════════════════
    dict(provider="google", model_id="gemini-2.0-flash-exp", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Gemini 2.0 Flash", cost_per_unit=0.0001, unit_type="token",
         avg_latency_ms=400, quality_score=0.87, requires_user_key=False),
    dict(provider="google", model_id="gemini-1.5-pro-latest", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Gemini 1.5 Pro", cost_per_unit=0.00125, unit_type="token",
         avg_latency_ms=1200, quality_score=0.93, requires_user_key=False),
    dict(provider="google", model_id="gemini-1.5-flash-latest", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Gemini 1.5 Flash", cost_per_unit=0.000075, unit_type="token",
         avg_latency_ms=500, quality_score=0.84, requires_user_key=False),
    dict(provider="google", model_id="gemini-1.0-pro", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Gemini 1.0 Pro", cost_per_unit=0.0005, unit_type="token",
         avg_latency_ms=800, quality_score=0.79, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # XAI (Grok)
    # ══════════════════════════════════════════════════════════════════
    dict(provider="xai", model_id="grok-3-beta", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Grok 3", cost_per_unit=0.005, unit_type="token",
         avg_latency_ms=1400, quality_score=0.94, requires_user_key=False),
    dict(provider="xai", model_id="grok-3-mini-beta", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Grok 3 Mini", cost_per_unit=0.0003, unit_type="token",
         avg_latency_ms=600, quality_score=0.82, requires_user_key=False),
    dict(provider="xai", model_id="grok-2-1212", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Grok 2", cost_per_unit=0.002, unit_type="token",
         avg_latency_ms=1000, quality_score=0.88, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # QWEN (Alibaba)
    # ══════════════════════════════════════════════════════════════════
    dict(provider="qwen", model_id="qwen-max", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Qwen Max", cost_per_unit=0.0024, unit_type="token",
         avg_latency_ms=1300, quality_score=0.90, requires_user_key=False),
    dict(provider="qwen", model_id="qwen-plus", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Qwen Plus", cost_per_unit=0.0004, unit_type="token",
         avg_latency_ms=700, quality_score=0.83, requires_user_key=False),
    dict(provider="qwen", model_id="qwen-turbo", modality="text", task_type="chat",
         task_types=["chat", "summarization", "translation"],
         display_name="Qwen Turbo", cost_per_unit=0.00006, unit_type="token",
         avg_latency_ms=400, quality_score=0.75, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # STABILITY AI — Image
    # ══════════════════════════════════════════════════════════════════
    dict(provider="stability", model_id="stability-ai/stable-image-core", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         display_name="Stable Image Core", cost_per_unit=3, unit_type="image",
         avg_latency_ms=6000, quality_score=0.85, requires_user_key=False),
    dict(provider="stability", model_id="stability-ai/stable-image-ultra", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         display_name="Stable Image Ultra", cost_per_unit=8, unit_type="image",
         avg_latency_ms=9000, quality_score=0.91, requires_user_key=False),
    dict(provider="stability", model_id="stability-ai/sd3-medium", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         display_name="Stable Diffusion 3 Medium", cost_per_unit=4, unit_type="image",
         avg_latency_ms=7000, quality_score=0.87, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # BLACK FOREST LABS — FLUX via Fal.ai  (Text-to-Image)
    # ══════════════════════════════════════════════════════════════════
    dict(provider="fal", model_id="fal-ai/flux/schnell", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         vendor="black_forest_labs",
         display_name="FLUX Schnell", cost_per_unit=10, unit_type="image",
         avg_latency_ms=2000, quality_score=0.80, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/flux/dev", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         vendor="black_forest_labs",
         display_name="FLUX Dev", cost_per_unit=20, unit_type="image",
         avg_latency_ms=4000, quality_score=0.88, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/flux-pro/v1.1", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         vendor="black_forest_labs",
         display_name="FLUX 1.1 Pro", cost_per_unit=40, unit_type="image",
         avg_latency_ms=6000, quality_score=0.93, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/flux-pro/v1.1-ultra", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         vendor="black_forest_labs",
         display_name="FLUX 1.1 Pro Ultra", cost_per_unit=60, unit_type="image",
         avg_latency_ms=8000, quality_score=0.95, requires_user_key=False),

    # BLACK FOREST LABS — FLUX Image-to-Image & Editing
    dict(provider="fal", model_id="fal-ai/flux/dev/image-to-image", modality="image",
         task_type="image_to_image", task_types=["image_to_image"],
         vendor="black_forest_labs",
         display_name="FLUX Dev (Image to Image)", cost_per_unit=20, unit_type="image",
         avg_latency_ms=5000, quality_score=0.87, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/flux-pro/kontext", modality="image",
         task_type="image_to_image", task_types=["image_to_image", "image_editing"],
         vendor="black_forest_labs",
         display_name="FLUX Kontext", cost_per_unit=45, unit_type="image",
         avg_latency_ms=7000, quality_score=0.94, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/flux-pro/v1/fill", modality="image",
         task_type="image_editing", task_types=["image_editing"],
         vendor="black_forest_labs",
         display_name="FLUX Fill Pro", cost_per_unit=35, unit_type="image",
         avg_latency_ms=6000, quality_score=0.91, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # IDEOGRAM via Fal.ai
    # ══════════════════════════════════════════════════════════════════
    dict(provider="fal", model_id="fal-ai/ideogram/v3", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         vendor="ideogram",
         display_name="Ideogram V3", cost_per_unit=50, unit_type="image",
         avg_latency_ms=8000, quality_score=0.90, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/ideogram/v2", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         vendor="ideogram",
         display_name="Ideogram V2", cost_per_unit=35, unit_type="image",
         avg_latency_ms=6000, quality_score=0.85, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/ideogram/v2/turbo", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         vendor="ideogram",
         display_name="Ideogram V2 Turbo", cost_per_unit=20, unit_type="image",
         avg_latency_ms=4000, quality_score=0.82, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/ideogram/v2/edit", modality="image",
         task_type="image_editing", task_types=["image_editing"],
         vendor="ideogram",
         display_name="Ideogram V2 Edit", cost_per_unit=40, unit_type="image",
         avg_latency_ms=7000, quality_score=0.86, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # RECRAFT via Fal.ai
    # ══════════════════════════════════════════════════════════════════
    dict(provider="fal", model_id="fal-ai/recraft-v3", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         vendor="recraft",
         display_name="Recraft V3", cost_per_unit=40, unit_type="image",
         avg_latency_ms=5000, quality_score=0.88, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/recraft-v3/create-style", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         vendor="recraft",
         display_name="Recraft V3 Style", cost_per_unit=50, unit_type="image",
         avg_latency_ms=6000, quality_score=0.90, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # OTHER IMAGE MODELS via Fal.ai
    # ══════════════════════════════════════════════════════════════════
    dict(provider="fal", model_id="fal-ai/luma-photon", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         vendor="luma",
         display_name="Luma Photon", cost_per_unit=30, unit_type="image",
         avg_latency_ms=5000, quality_score=0.83, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/hyper-sdxl", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         display_name="Hyper SDXL", cost_per_unit=8, unit_type="image",
         avg_latency_ms=3000, quality_score=0.79, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/aura-flow", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         display_name="AuraFlow", cost_per_unit=12, unit_type="image",
         avg_latency_ms=4000, quality_score=0.81, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/stable-diffusion-v3-medium", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         vendor="stability",
         display_name="Stable Diffusion 3 (Fal)", cost_per_unit=15, unit_type="image",
         avg_latency_ms=7000, quality_score=0.84, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/sana/sprint/1.6b", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         vendor="nvidia",
         display_name="Sana Sprint 1.6B", cost_per_unit=5, unit_type="image",
         avg_latency_ms=1500, quality_score=0.82, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/minimax/image-01", modality="image",
         task_type="text_to_image", task_types=["text_to_image"],
         vendor="hailuo",
         display_name="Hailuo Image 01", cost_per_unit=25, unit_type="image",
         avg_latency_ms=5000, quality_score=0.86, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # KLING — Video via Fal.ai
    # ══════════════════════════════════════════════════════════════════
    dict(provider="kling", model_id="fal-ai/kling-video/v3/text-to-video", modality="video",
         task_type="text_to_video", task_types=["text_to_video"],
         display_name="Kling 3.0 (T2V)", cost_per_unit=600, unit_type="generation",
         avg_latency_ms=70000, quality_score=0.96, requires_user_key=False),
    dict(provider="kling", model_id="fal-ai/kling-video/v3/image-to-video", modality="video",
         task_type="image_to_video", task_types=["image_to_video"],
         display_name="Kling 3.0 (I2V)", cost_per_unit=600, unit_type="generation",
         avg_latency_ms=70000, quality_score=0.96, requires_user_key=False),
    dict(provider="kling", model_id="fal-ai/kling-video/v3/motion-control", modality="video",
         task_type="video_to_video", task_types=["video_to_video"],
         display_name="Kling 3.0 Motion Control (V2V)", cost_per_unit=700, unit_type="generation",
         avg_latency_ms=80000, quality_score=0.95, requires_user_key=False),
    dict(provider="kling", model_id="fal-ai/kling-video/v2.6/motion-control", modality="video",
         task_type="video_to_video", task_types=["video_to_video"],
         display_name="Kling 2.6 Motion Control (V2V)", cost_per_unit=450, unit_type="generation",
         avg_latency_ms=60000, quality_score=0.91, requires_user_key=False),
    dict(provider="kling", model_id="fal-ai/kling-video/v3/lip-sync", modality="video",
         task_type="lip_sync", task_types=["lip_sync"],
         display_name="Kling 3.0 Lip Sync", cost_per_unit=400, unit_type="generation",
         avg_latency_ms=50000, quality_score=0.90, requires_user_key=False),
    dict(provider="kling", model_id="fal-ai/kling-video/v2/master/text-to-video", modality="video",
         task_type="text_to_video", task_types=["text_to_video"],
         display_name="Kling 2 Master (T2V)", cost_per_unit=500, unit_type="generation",
         avg_latency_ms=60000, quality_score=0.92, requires_user_key=False),
    dict(provider="kling", model_id="fal-ai/kling-video/v1.6/standard/text-to-video", modality="video",
         task_type="text_to_video", task_types=["text_to_video"],
         display_name="Kling 1.6 Standard (T2V)", cost_per_unit=200, unit_type="generation",
         avg_latency_ms=45000, quality_score=0.85, requires_user_key=False),
    dict(provider="kling", model_id="fal-ai/kling-video/v1.6/standard/image-to-video", modality="video",
         task_type="image_to_video", task_types=["image_to_video"],
         display_name="Kling 1.6 Standard (I2V)", cost_per_unit=200, unit_type="generation",
         avg_latency_ms=45000, quality_score=0.85, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # LUMA — Video via Fal.ai
    # ══════════════════════════════════════════════════════════════════
    dict(provider="luma", model_id="fal-ai/luma-dream-machine", modality="video",
         task_type="text_to_video", task_types=["text_to_video"],
         display_name="Luma Dream Machine (T2V)", cost_per_unit=350, unit_type="generation",
         avg_latency_ms=90000, quality_score=0.88, requires_user_key=False),
    dict(provider="luma", model_id="fal-ai/luma-dream-machine/image-to-video", modality="video",
         task_type="image_to_video", task_types=["image_to_video"],
         display_name="Luma Dream Machine (I2V)", cost_per_unit=350, unit_type="generation",
         avg_latency_ms=90000, quality_score=0.88, requires_user_key=False),
    dict(provider="luma", model_id="fal-ai/luma-dream-machine/ray-2-flash", modality="video",
         task_type="text_to_video", task_types=["text_to_video", "image_to_video"],
         display_name="Luma Ray 2 Flash", cost_per_unit=150, unit_type="generation",
         avg_latency_ms=50000, quality_score=0.84, requires_user_key=False),
    dict(provider="luma", model_id="fal-ai/luma-dream-machine/ray-2", modality="video",
         task_type="text_to_video", task_types=["text_to_video", "image_to_video"],
         display_name="Luma Ray 2", cost_per_unit=300, unit_type="generation",
         avg_latency_ms=70000, quality_score=0.90, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # HAILUO (MiniMax) — Video via Fal.ai
    # ══════════════════════════════════════════════════════════════════
    dict(provider="hailuo", model_id="fal-ai/minimax/video-01", modality="video",
         task_type="text_to_video", task_types=["text_to_video", "image_to_video"],
         display_name="Hailuo Video 01 (T2V)", cost_per_unit=250, unit_type="generation",
         avg_latency_ms=70000, quality_score=0.87, requires_user_key=False),
    dict(provider="hailuo", model_id="fal-ai/minimax/video-01-live", modality="video",
         task_type="text_to_video", task_types=["text_to_video"],
         display_name="Hailuo Video 01 Live", cost_per_unit=300, unit_type="generation",
         avg_latency_ms=80000, quality_score=0.89, requires_user_key=False),
    dict(provider="hailuo", model_id="fal-ai/minimax/video-2.3", modality="video",
         task_type="text_to_video", task_types=["text_to_video", "image_to_video"],
         display_name="Hailuo Video 2.3", cost_per_unit=400, unit_type="generation",
         avg_latency_ms=90000, quality_score=0.93, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # WAN — Video via Fal.ai
    # ══════════════════════════════════════════════════════════════════
    dict(provider="wan", model_id="fal-ai/wan/v2.7/t2v-13b", modality="video",
         task_type="text_to_video",
         task_types=["text_to_video", "image_to_video", "video_to_video", "video_editing"],
         display_name="Wan 2.7 (Multi-task)", cost_per_unit=300, unit_type="generation",
         avg_latency_ms=100000, quality_score=0.92, requires_user_key=False),
    dict(provider="wan", model_id="fal-ai/wan/v2.6/vace-14b", modality="video",
         task_type="text_to_video",
         task_types=["text_to_video", "image_to_video", "video_to_video"],
         display_name="Wan 2.6 VACE 14B", cost_per_unit=250, unit_type="generation",
         avg_latency_ms=100000, quality_score=0.88, requires_user_key=False),
    dict(provider="wan", model_id="fal-ai/wan/t2v-1.3b", modality="video",
         task_type="text_to_video", task_types=["text_to_video"],
         display_name="Wan 1.3B (T2V)", cost_per_unit=80, unit_type="generation",
         avg_latency_ms=40000, quality_score=0.78, requires_user_key=False),
    dict(provider="wan", model_id="fal-ai/wan/t2v-14b", modality="video",
         task_type="text_to_video", task_types=["text_to_video"],
         display_name="Wan 14B (T2V)", cost_per_unit=200, unit_type="generation",
         avg_latency_ms=90000, quality_score=0.86, requires_user_key=False),
    dict(provider="wan", model_id="fal-ai/wan/i2v-14b", modality="video",
         task_type="image_to_video", task_types=["image_to_video"],
         display_name="Wan 14B (I2V)", cost_per_unit=200, unit_type="generation",
         avg_latency_ms=90000, quality_score=0.86, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # BYTEDANCE (Seedance) — Video via Fal.ai
    # ══════════════════════════════════════════════════════════════════
    dict(provider="bytedance", model_id="fal-ai/bytedance/seedance-1-lite", modality="video",
         task_type="text_to_video", task_types=["text_to_video", "image_to_video"],
         display_name="Seedance 1 Lite (T2V)", cost_per_unit=100, unit_type="generation",
         avg_latency_ms=35000, quality_score=0.82, requires_user_key=False),
    dict(provider="bytedance", model_id="fal-ai/bytedance/seedance-1-pro", modality="video",
         task_type="text_to_video", task_types=["text_to_video", "image_to_video"],
         display_name="Seedance 1 Pro (T2V)", cost_per_unit=300, unit_type="generation",
         avg_latency_ms=60000, quality_score=0.90, requires_user_key=False),
    dict(provider="bytedance", model_id="fal-ai/bytedance/seedance-2.0", modality="video",
         task_type="text_to_video", task_types=["text_to_video", "image_to_video"],
         display_name="Seedance 2.0", cost_per_unit=500, unit_type="generation",
         avg_latency_ms=90000, quality_score=0.95, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # RUNWAY — Video via Fal.ai
    # ══════════════════════════════════════════════════════════════════
    dict(provider="runway", model_id="fal-ai/runway-gen3/turbo/text-to-video", modality="video",
         task_type="text_to_video", task_types=["text_to_video"],
         display_name="Runway Gen3 Turbo (T2V)", cost_per_unit=350, unit_type="generation",
         avg_latency_ms=45000, quality_score=0.88, requires_user_key=False),
    dict(provider="runway", model_id="fal-ai/runway-gen3/turbo/image-to-video", modality="video",
         task_type="image_to_video", task_types=["image_to_video"],
         display_name="Runway Gen3 Turbo (I2V)", cost_per_unit=400, unit_type="generation",
         avg_latency_ms=50000, quality_score=0.90, requires_user_key=False),
    dict(provider="runway", model_id="fal-ai/runway-gen4/text-to-video", modality="video",
         task_type="text_to_video", task_types=["text_to_video"],
         display_name="Runway Gen4 (T2V)", cost_per_unit=480, unit_type="generation",
         avg_latency_ms=55000, quality_score=0.93, requires_user_key=False),
    dict(provider="runway", model_id="fal-ai/runway-gen4/image-to-video", modality="video",
         task_type="image_to_video", task_types=["image_to_video"],
         display_name="Runway Gen4 (I2V)", cost_per_unit=500, unit_type="generation",
         avg_latency_ms=60000, quality_score=0.93, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # TOPAZ — Video Upscaling via Fal.ai
    # ══════════════════════════════════════════════════════════════════
    dict(provider="topaz", model_id="fal-ai/topaz/video-upscale", modality="video",
         task_type="video_to_video", task_types=["video_to_video"],
         vendor="topaz",
         display_name="Topaz Video Upscaler", cost_per_unit=200, unit_type="generation",
         avg_latency_ms=120000, quality_score=0.96, requires_user_key=False,
         is_active=True),

    # ══════════════════════════════════════════════════════════════════
    # SPEECH TO VIDEO & LIP SYNC via Fal.ai
    # ══════════════════════════════════════════════════════════════════
    dict(provider="fal", model_id="fal-ai/sadtalker", modality="video",
         task_type="speech_to_video", task_types=["speech_to_video"],
         display_name="SadTalker", cost_per_unit=50, unit_type="generation",
         avg_latency_ms=30000, quality_score=0.75, requires_user_key=False,
         is_active=True),
    dict(provider="fal", model_id="fal-ai/hallo", modality="video",
         task_type="speech_to_video", task_types=["speech_to_video"],
         display_name="Hallo", cost_per_unit=80, unit_type="generation",
         avg_latency_ms=45000, quality_score=0.80, requires_user_key=False,
         is_active=True),
    dict(provider="fal", model_id="fal-ai/latentsync", modality="video",
         task_type="lip_sync", task_types=["lip_sync"],
         display_name="LatentSync", cost_per_unit=60, unit_type="generation",
         avg_latency_ms=35000, quality_score=0.82, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/sync-lipsync", modality="video",
         task_type="lip_sync", task_types=["lip_sync"],
         display_name="Sync Labs Lip Sync", cost_per_unit=100, unit_type="generation",
         avg_latency_ms=40000, quality_score=0.88, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # ELEVENLABS — Audio
    # ══════════════════════════════════════════════════════════════════
    dict(provider="elevenlabs", model_id="eleven_multilingual_v2", modality="audio",
         task_type="text_to_speech", task_types=["text_to_speech"],
         display_name="ElevenLabs Multilingual V2", cost_per_unit=0.30, unit_type="character",
         avg_latency_ms=2000, quality_score=0.95, requires_user_key=False),
    dict(provider="elevenlabs", model_id="eleven_turbo_v2_5", modality="audio",
         task_type="text_to_speech", task_types=["text_to_speech"],
         display_name="ElevenLabs Turbo V2.5", cost_per_unit=0.15, unit_type="character",
         avg_latency_ms=800, quality_score=0.88, requires_user_key=False),
    dict(provider="elevenlabs", model_id="eleven_flash_v2_5", modality="audio",
         task_type="text_to_speech", task_types=["text_to_speech"],
         display_name="ElevenLabs Flash V2.5", cost_per_unit=0.08, unit_type="character",
         avg_latency_ms=400, quality_score=0.82, requires_user_key=False),

    # ══════════════════════════════════════════════════════════════════
    # MUSIC & AUDIO via Fal.ai
    # ══════════════════════════════════════════════════════════════════
    dict(provider="fal", model_id="fal-ai/stable-audio", modality="audio",
         task_type="text_to_music", task_types=["text_to_music"],
         vendor="stability",
         display_name="Stable Audio (Text to Music)", cost_per_unit=20, unit_type="generation",
         avg_latency_ms=15000, quality_score=0.82, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/mmaudio-v2", modality="audio",
         task_type="text_to_music", task_types=["text_to_music"],
         display_name="MMAudio V2 (Text to Music)", cost_per_unit=15, unit_type="generation",
         avg_latency_ms=10000, quality_score=0.78, requires_user_key=False),
    dict(provider="fal", model_id="fal-ai/rvc", modality="audio",
         task_type="audio_to_audio", task_types=["audio_to_audio"],
         display_name="Voice RVC (Audio to Audio)", cost_per_unit=10, unit_type="generation",
         avg_latency_ms=8000, quality_score=0.80, requires_user_key=False),
]


def seed():
    db = SessionLocal()
    added = 0
    updated = 0
    for m in MODELS:
        exists = db.query(ModelRegistry).filter_by(
            provider=m["provider"], model_id=m["model_id"]
        ).first()
        if not exists:
            # Strip is_active from dict if not set (use DB default True)
            entry = {k: v for k, v in m.items() if k != "is_active" or "is_active" in m}
            db.add(ModelRegistry(**entry))
            added += 1
        else:
            for field in ("task_type", "task_types", "vendor", "display_name", "requires_user_key", "unit_type", "cost_per_unit", "avg_latency_ms", "quality_score", "is_active"):
                if field in m and getattr(exists, field) != m[field]:
                    setattr(exists, field, m[field])
                    updated += 1
    db.commit()
    db.close()
    print(f"Seeded {added} new model(s), updated {updated} field(s).")


if __name__ == "__main__":
    seed()
