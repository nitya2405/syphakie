import httpx
from app.providers.base import BaseAdapter, AdapterRequest, AdapterResponse
from app.core.exceptions import ProviderError

_BASE = "https://api.x.ai/v1"


class XaiAdapter(BaseAdapter):
    """xAI Grok — OpenAI-compatible API."""
    provider_name = "xai"

    async def generate(self, request: AdapterRequest) -> AdapterResponse:
        if request.modality == "text":
            return await self._chat(request)
        raise ValueError(f"xAI adapter does not support modality: {request.modality}")

    async def _chat(self, request: AdapterRequest) -> AdapterResponse:
        payload = {
            "model": request.model_id,
            "messages": [{"role": "user", "content": request.prompt}],
        }
        payload.update(request.params)

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{_BASE}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {request.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            raise ProviderError("xai", f"HTTP {e.response.status_code}: {e.response.text[:300]}")
        except httpx.RequestError as e:
            raise ProviderError("xai", f"Request failed: {str(e)}")

        return AdapterResponse(
            content=data["choices"][0]["message"]["content"],
            file_bytes=None,
            file_extension=None,
            units_used=float(data["usage"]["total_tokens"]),
            unit_type="token",
            raw_response=data,
        )
