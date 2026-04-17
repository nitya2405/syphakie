import httpx
from app.providers.base import BaseAdapter, AdapterRequest, AdapterResponse
from app.core.exceptions import ProviderError

_API_URL = "https://api.anthropic.com/v1/messages"
_API_VERSION = "2023-06-01"


class AnthropicAdapter(BaseAdapter):
    provider_name = "anthropic"

    async def generate(self, request: AdapterRequest) -> AdapterResponse:
        if request.modality == "text":
            return await self._text(request)
        raise ValueError(f"Anthropic adapter does not support modality: {request.modality}")

    async def _text(self, request: AdapterRequest) -> AdapterResponse:
        max_tokens = int(request.params.get("max_tokens", 1024))
        payload = {
            "model": request.model_id,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": request.prompt}],
        }
        if "system" in request.params:
            payload["system"] = str(request.params["system"])

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    _API_URL,
                    headers={
                        "x-api-key": request.api_key,
                        "anthropic-version": _API_VERSION,
                        "content-type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            raise ProviderError("anthropic", f"HTTP {e.response.status_code}: {e.response.text[:300]}")
        except httpx.RequestError as e:
            raise ProviderError("anthropic", f"Request failed: {str(e)}")

        content = data["content"][0]["text"]
        usage = data.get("usage", {})
        tokens = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

        return AdapterResponse(
            content=content,
            file_bytes=None,
            file_extension=None,
            units_used=float(tokens),
            unit_type="token",
            raw_response=data,
        )
