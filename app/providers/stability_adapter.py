import httpx
from app.providers.base import BaseAdapter, AdapterRequest, AdapterResponse
from app.core.exceptions import ProviderError

# Maps model_id → (api endpoint suffix, extra form fields)
_MODEL_ROUTES: dict[str, tuple[str, dict]] = {
    "stability-ai/stable-image-core":  ("core",  {}),
    "stability-ai/stable-image-ultra": ("ultra", {}),
    "stability-ai/sd3-medium":         ("sd3",   {"model": "sd3-medium"}),
    "stability-ai/sd3-large":          ("sd3",   {"model": "sd3-large-turbo"}),
}
_BASE = "https://api.stability.ai/v2beta/stable-image/generate"


class StabilityAdapter(BaseAdapter):
    provider_name = "stability"

    async def generate(self, request: AdapterRequest) -> AdapterResponse:
        if request.modality == "image":
            return await self._image(request)
        raise ValueError(f"Stability adapter does not support modality: {request.modality}")

    async def _image(self, request: AdapterRequest) -> AdapterResponse:
        suffix, extra = _MODEL_ROUTES.get(request.model_id, ("core", {}))
        url = f"{_BASE}/{suffix}"

        form: dict[str, str] = {
            "prompt": request.prompt,
            "output_format": "png",
            **extra,
        }
        if "negative_prompt" in request.params:
            form["negative_prompt"] = str(request.params["negative_prompt"])

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Bearer {request.api_key}",
                        "Accept": "image/*",
                    },
                    data=form,
                )
                resp.raise_for_status()
                file_bytes = resp.content
        except httpx.HTTPStatusError as e:
            raise ProviderError("stability", f"HTTP {e.response.status_code}: {e.response.text[:300]}")
        except httpx.RequestError as e:
            raise ProviderError("stability", f"Request failed: {str(e)}")

        return AdapterResponse(
            content=None,
            file_bytes=file_bytes,
            file_extension="png",
            units_used=1,
            unit_type="image",
            raw_response={},
        )
