import httpx
from app.providers.base import BaseAdapter, AdapterRequest, AdapterResponse
from app.core.exceptions import ProviderError

_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GoogleAdapter(BaseAdapter):
    provider_name = "google"

    async def generate(self, request: AdapterRequest) -> AdapterResponse:
        if request.modality == "text":
            return await self._chat(request)
        raise ValueError(f"Google adapter does not support modality: {request.modality}")

    async def _chat(self, request: AdapterRequest) -> AdapterResponse:
        url = f"{_BASE}/{request.model_id}:generateContent"
        payload = {
            "contents": [{"parts": [{"text": request.prompt}]}],
            "generationConfig": {
                "maxOutputTokens": int(request.params.get("max_tokens", 2048)),
                "temperature": float(request.params.get("temperature", 0.7)),
            },
        }
        if "system" in request.params:
            payload["systemInstruction"] = {"parts": [{"text": str(request.params["system"])}]}

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    url,
                    headers={
                        "x-goog-api-key": request.api_key,
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            raise ProviderError("google", f"HTTP {e.response.status_code}: {e.response.text[:300]}")
        except httpx.RequestError as e:
            raise ProviderError("google", f"Request failed: {str(e)}")

        content = data["candidates"][0]["content"]["parts"][0]["text"]
        usage = data.get("usageMetadata", {})
        tokens = usage.get("totalTokenCount", 0) or (
            usage.get("promptTokenCount", 0) + usage.get("candidatesTokenCount", 0)
        )

        return AdapterResponse(
            content=content,
            file_bytes=None,
            file_extension=None,
            units_used=float(tokens),
            unit_type="token",
            raw_response=data,
        )
