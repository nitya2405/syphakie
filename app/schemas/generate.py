from pydantic import BaseModel, field_validator
from typing import Any


class GenerateRequest(BaseModel):
    modality: str           # "text" | "image"
    mode: str               # "manual" only for now
    prompt: str
    model: str | None = None
    provider: str | None = None
    params: dict[str, Any] = {}

    @field_validator("modality")
    @classmethod
    def validate_modality(cls, v):
        if v not in ("text", "image"):
            raise ValueError("modality must be 'text' or 'image'")
        return v

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v):
        if v not in ("manual", "auto"):
            raise ValueError("mode must be 'manual' or 'auto'")
        return v


class OutputSchema(BaseModel):
    type: str
    content: str | None
    url: str | None
    mime_type: str | None


class MetaSchema(BaseModel):
    latency_ms: int
    credits_used: int
    credits_remaining: int
    units_used: float
    unit_type: str
    routing_mode: str


class GenerateResponse(BaseModel):
    success: bool
    request_id: str
    modality: str
    provider: str
    model: str
    output: OutputSchema
    meta: MetaSchema
