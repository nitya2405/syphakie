from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any


@dataclass
class AdapterRequest:
    modality: str           # "text" | "image"
    prompt: str
    model_id: str
    params: dict[str, Any]
    api_key: str


@dataclass
class AdapterResponse:
    content: str | None         # populated for text
    file_bytes: bytes | None    # populated for image
    file_extension: str | None  # "png", "jpg"
    units_used: float           # tokens or images
    unit_type: str              # "token" | "image"
    raw_response: dict


class BaseAdapter(ABC):
    provider_name: str

    @abstractmethod
    async def generate(self, request: AdapterRequest) -> AdapterResponse:
        ...
