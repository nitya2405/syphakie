import httpx
from app.providers.base import BaseAdapter, AdapterRequest, AdapterResponse
from app.core.exceptions import ProviderError


class FalAdapter(BaseAdapter):
    provider_name = "fal"

    async def generate(self, request: AdapterRequest) -> AdapterResponse:
        if request.modality == "image":
            return await self._image(request)
        raise ValueError(f"Fal adapter does not support modality: {request.modality}")

    async def _image(self, request: AdapterRequest) -> AdapterResponse:
        payload = {
            "prompt": request.prompt,
            "num_images": 1,
            "image_size": request.params.get("image_size", "square_hd"),
        }

        # fal model_id is used as the URL path: fal-ai/flux/schnell
        url = f"https://fal.run/{request.model_id}"

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    url,
                    headers={
                        "Authorization": f"Key {request.api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

                image_url = data["images"][0]["url"]
                image_resp = await client.get(image_url)
                image_resp.raise_for_status()
                file_bytes = image_resp.content

        except httpx.HTTPStatusError as e:
            raise ProviderError("fal", f"HTTP {e.response.status_code}: {e.response.text}")
        except httpx.RequestError as e:
            raise ProviderError("fal", f"Request failed: {str(e)}")

        return AdapterResponse(
            content=None,
            file_bytes=file_bytes,
            file_extension="jpg",
            units_used=1,
            unit_type="image",
            raw_response=data,
        )
