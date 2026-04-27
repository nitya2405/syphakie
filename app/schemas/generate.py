from pydantic import BaseModel, field_validator
from typing import Any


class GenerateRequest(BaseModel):
    modality: str           # "text" | "image" | "video" | "audio"
    mode: str               # "manual" | "auto" | "best" | "budget"
    prompt: str
    image_url: str | None = None
    file_url: str | None = None
    model: str | None = None
    provider: str | None = None
    task_type: str | None = None
    max_cost: float | None = None   # for mode=budget: max cost_per_unit ceiling
    use_cache: bool = True
    params: dict[str, Any] = {}
    use_org_credits: bool = False
    async_job: bool = False

    @field_validator("modality")
    @classmethod
    def validate_modality(cls, v):
        if v not in ("text", "image", "video", "audio"):
            raise ValueError("modality must be 'text', 'image', 'video', or 'audio'")
        return v

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, v):
        if v not in ("manual", "auto", "best", "budget"):
            raise ValueError("mode must be 'manual', 'auto', 'best', or 'budget'")
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
    fallback_provider: str | None = None


class GenerateResponse(BaseModel):
    success: bool
    request_id: str
    modality: str
    provider: str
    model: str
    output: OutputSchema
    meta: MetaSchema
