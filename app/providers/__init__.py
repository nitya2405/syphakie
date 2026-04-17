from app.providers.openai_adapter import OpenAIAdapter
from app.providers.fal_adapter import FalAdapter
from app.providers.stability_adapter import StabilityAdapter
from app.providers.anthropic_adapter import AnthropicAdapter
from app.providers.google_adapter import GoogleAdapter
from app.providers.xai_adapter import XaiAdapter
from app.providers.elevenlabs_adapter import ElevenLabsAdapter
from app.providers.qwen_adapter import QwenAdapter
from app.providers.base import BaseAdapter

ADAPTER_REGISTRY: dict[str, type[BaseAdapter]] = {
    # Direct API providers
    "openai":      OpenAIAdapter,
    "anthropic":   AnthropicAdapter,
    "stability":   StabilityAdapter,
    "google":      GoogleAdapter,
    "xai":         XaiAdapter,
    "elevenlabs":  ElevenLabsAdapter,
    "qwen":        QwenAdapter,
    # Fal.ai and its brand aliases
    "fal":         FalAdapter,
    "kling":       FalAdapter,
    "luma":        FalAdapter,
    "hailuo":      FalAdapter,
    "wan":         FalAdapter,
    "bytedance":   FalAdapter,
    "runway":      FalAdapter,
}


def get_adapter(provider: str) -> BaseAdapter:
    if provider not in ADAPTER_REGISTRY:
        raise ValueError(f"No adapter registered for provider: {provider}")
    return ADAPTER_REGISTRY[provider]()
