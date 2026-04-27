import json
import time
import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import AsyncIterator
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.model_registry import ModelRegistry
from app.services.generate import _FAL_BACKED, _PLATFORM_KEYS

router = APIRouter()


class OAIMessage(BaseModel):
    role: str
    content: str


class OAIChatRequest(BaseModel):
    model: str
    messages: list[OAIMessage]
    temperature: float | None = None
    max_tokens: int | None = None
    stream: bool = False


def _get_model_and_key(body: OAIChatRequest, db: Session):
    model = db.query(ModelRegistry).filter_by(model_id=body.model, is_active=True).first()
    if not model:
        raise HTTPException(status_code=404, detail={"code": "MODEL_NOT_FOUND", "message": f"Model {body.model!r} not found."})
    if model.modality != "text":
        raise HTTPException(status_code=400, detail={"code": "WRONG_MODALITY", "message": "This endpoint only supports text/chat models."})
    key_provider = "fal" if model.provider in _FAL_BACKED else model.provider
    api_key = _PLATFORM_KEYS.get(key_provider, "")
    if not api_key:
        raise HTTPException(status_code=503, detail={"code": "PROVIDER_NOT_CONFIGURED", "message": f"Provider '{key_provider}' is not available."})
    return model, api_key


async def _stream_sse(body: OAIChatRequest, model, api_key: str) -> AsyncIterator[str]:
    from app.providers import get_adapter
    from app.providers.base import AdapterRequest
    completion_id = f"chatcmpl-{uuid.uuid4().hex[:24]}"
    prompt = "\n".join(f"{m.role}: {m.content}" for m in body.messages)

    adapter = get_adapter(model.provider)
    adapter_req = AdapterRequest(
        modality="text",
        prompt=prompt,
        model_id=model.model_id,
        params={"temperature": body.temperature, "max_tokens": body.max_tokens, "stream": True},
        api_key=api_key,
    )

    # Try adapter-level streaming; fall back to single-chunk if not supported
    try:
        async for token in adapter.stream(adapter_req):
            chunk = {
                "id": completion_id,
                "object": "chat.completion.chunk",
                "created": int(time.time()),
                "model": body.model,
                "choices": [{"index": 0, "delta": {"content": token}, "finish_reason": None}],
            }
            yield f"data: {json.dumps(chunk)}\n\n"
    except (AttributeError, NotImplementedError):
        # Adapter doesn't support streaming — generate full then emit as one chunk
        result = await adapter.generate(adapter_req)
        content = result.content if hasattr(result, "content") else (result.get("content", "") if isinstance(result, dict) else "")
        chunk = {
            "id": completion_id,
            "object": "chat.completion.chunk",
            "created": int(time.time()),
            "model": body.model,
            "choices": [{"index": 0, "delta": {"content": content}, "finish_reason": None}],
        }
        yield f"data: {json.dumps(chunk)}\n\n"

    # Final stop chunk
    stop_chunk = {
        "id": completion_id,
        "object": "chat.completion.chunk",
        "created": int(time.time()),
        "model": body.model,
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
    }
    yield f"data: {json.dumps(stop_chunk)}\n\n"
    yield "data: [DONE]\n\n"


@router.post("/v1/chat/completions")
async def openai_compat_chat(
    body: OAIChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    model, api_key = _get_model_and_key(body, db)

    if body.stream:
        return StreamingResponse(
            _stream_sse(body, model, api_key),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # Non-streaming path
    prompt = "\n".join(f"{m.role}: {m.content}" for m in body.messages)
    from app.providers import get_adapter
    from app.providers.base import AdapterRequest
    req = AdapterRequest(
        modality="text",
        prompt=prompt,
        model_id=model.model_id,
        params={"temperature": body.temperature, "max_tokens": body.max_tokens},
        api_key=api_key,
    )
    adapter = get_adapter(model.provider)
    result = await adapter.generate(req)
    content = result.content if hasattr(result, "content") else (result.get("content", "") if isinstance(result, dict) else "")

    return {
        "id": f"chatcmpl-{uuid.uuid4().hex[:24]}",
        "object": "chat.completion",
        "created": int(time.time()),
        "model": body.model,
        "choices": [{"index": 0, "message": {"role": "assistant", "content": content}, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


@router.get("/v1/models")
def list_openai_compat_models(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """OpenAI-compatible model listing."""
    models = db.query(ModelRegistry).filter_by(modality="text", is_active=True).all()
    import time
    return {
        "object": "list",
        "data": [
            {"id": m.model_id, "object": "model", "created": int(time.time()), "owned_by": m.provider}
            for m in models
        ],
    }
