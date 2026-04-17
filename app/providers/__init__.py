from app.providers.openai_adapter import OpenAIAdapter
from app.providers.fal_adapter import FalAdapter
from app.providers.stability_adapter import StabilityAdapter
from app.providers.anthropic_adapter import AnthropicAdapter
from app.providers.base import BaseAdapter

ADAPTER_REGISTRY: dict[str, type[BaseAdapter]] = {
    "openai":     OpenAIAdapter,
    "fal":        FalAdapter,
    "stability":  StabilityAdapter,
    "anthropic":  AnthropicAdapter,
}


def get_adapter(provider: str) -> BaseAdapter:
    if provider not in ADAPTER_REGISTRY:
        raise ValueError(f"No adapter registered for provider: {provider}")
    return ADAPTER_REGISTRY[provider]()
