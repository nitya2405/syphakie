import httpx
from app.providers.base import BaseAdapter, AdapterRequest, AdapterResponse
from app.core.exceptions import ProviderError


class OpenAIAdapter(BaseAdapter):
    provider_name = "openai"

    async def generate(self, request: AdapterRequest) -> AdapterResponse:
        if request.modality == "text":
            return await self._text(request)
        elif request.modality == "image":
            return await self._image(request)
        raise ValueError(f"OpenAI adapter does not support modality: {request.modality}")

    async def _text(self, request: AdapterRequest) -> AdapterResponse:
        payload = {
            "model": request.model_id,
            "messages": [{"role": "user", "content": request.prompt}],
        }
        # Allow caller to override max_tokens, temperature, etc.
        payload.update(request.params)

        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers={"Authorization": f"Bearer {request.api_key}"},
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPStatusError as e:
            raise ProviderError("openai", f"HTTP {e.response.status_code}: {e.response.text}")
        except httpx.RequestError as e:
            raise ProviderError("openai", f"Request failed: {str(e)}")

        return AdapterResponse(
            content=data["choices"][0]["message"]["content"],
            file_bytes=None,
            file_extension=None,
            units_used=data["usage"]["total_tokens"],
            unit_type="token",
            raw_response=data,
        )

    async def _image(self, request: AdapterRequest) -> AdapterResponse:
        payload = {
            "model": request.model_id,
            "prompt": request.prompt,
            "n": 1,
            "response_format": "url",
        }
        payload.update(request.params)

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/images/generations",
                    headers={"Authorization": f"Bearer {request.api_key}"},
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

                image_url = data["data"][0]["url"]
                image_resp = await client.get(image_url)
                image_resp.raise_for_status()
                file_bytes = image_resp.content

        except httpx.HTTPStatusError as e:
            raise ProviderError("openai", f"HTTP {e.response.status_code}: {e.response.text}")
        except httpx.RequestError as e:
            raise ProviderError("openai", f"Request failed: {str(e)}")

        return AdapterResponse(
            content=None,
            file_bytes=file_bytes,
            file_extension="png",
            units_used=1,
            unit_type="image",
            raw_response=data,
        )
