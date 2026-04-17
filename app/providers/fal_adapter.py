import httpx
from app.providers.base import BaseAdapter, AdapterRequest, AdapterResponse
from app.core.exceptions import ProviderError


class FalAdapter(BaseAdapter):
    provider_name = "fal"

    async def generate(self, request: AdapterRequest) -> AdapterResponse:
        if request.modality == "image":
            return await self._image(request)
        if request.modality == "video":
            return await self._video(request)
        if request.modality == "audio":
            return await self._audio(request)
        raise ValueError(f"Fal adapter does not support modality: {request.modality}")

    async def _image(self, request: AdapterRequest) -> AdapterResponse:
        payload = {
            "prompt": request.prompt,
            "num_images": 1,
            "image_size": request.params.get("image_size", "square_hd"),
        }
        url = f"https://fal.run/{request.model_id}"
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    url,
                    headers={"Authorization": f"Key {request.api_key}", "Content-Type": "application/json"},
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()
                image_url = data["images"][0]["url"]
                image_resp = await client.get(image_url)
                image_resp.raise_for_status()
                file_bytes = image_resp.content
        except httpx.HTTPStatusError as e:
            raise ProviderError("fal", f"HTTP {e.response.status_code}: {e.response.text[:300]}")
        except httpx.RequestError as e:
            raise ProviderError("fal", f"Request failed: {str(e)}")

        return AdapterResponse(
            content=None, file_bytes=file_bytes, file_extension="jpg",
            units_used=1, unit_type="image", raw_response=data,
        )

    async def _video(self, request: AdapterRequest) -> AdapterResponse:
        payload = {"prompt": request.prompt}
        # Pass through any extra params (aspect_ratio, duration, etc.)
        payload.update({k: v for k, v in request.params.items() if k != "image_url"})

        # image_to_video models also accept an image_url
        if "image_url" in request.params:
            payload["image_url"] = request.params["image_url"]

        url = f"https://fal.run/{request.model_id}"
        try:
            async with httpx.AsyncClient(timeout=300) as client:
                resp = await client.post(
                    url,
                    headers={"Authorization": f"Key {request.api_key}", "Content-Type": "application/json"},
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

                # Different models return video URL under different keys
                video_url = (
                    data.get("video", {}).get("url")
                    or data.get("video_url")
                    or (data.get("videos") or [{}])[0].get("url")
                )
                if not video_url:
                    raise ProviderError("fal", f"No video URL in response: {str(data)[:200]}")

                video_resp = await client.get(video_url)
                video_resp.raise_for_status()
                file_bytes = video_resp.content

        except httpx.HTTPStatusError as e:
            raise ProviderError("fal", f"HTTP {e.response.status_code}: {e.response.text[:300]}")
        except httpx.RequestError as e:
            raise ProviderError("fal", f"Request failed: {str(e)}")

        return AdapterResponse(
            content=None, file_bytes=file_bytes, file_extension="mp4",
            units_used=1, unit_type="video", raw_response=data,
        )

    async def _audio(self, request: AdapterRequest) -> AdapterResponse:
        payload = {"prompt": request.prompt}
        payload.update(request.params)

        url = f"https://fal.run/{request.model_id}"
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                resp = await client.post(
                    url,
                    headers={"Authorization": f"Key {request.api_key}", "Content-Type": "application/json"},
                    json=payload,
                )
                resp.raise_for_status()
                data = resp.json()

                audio_url = (
                    data.get("audio_file", {}).get("url")
                    or data.get("audio", {}).get("url")
                    or data.get("audio_url")
                )
                if not audio_url:
                    raise ProviderError("fal", f"No audio URL in response: {str(data)[:200]}")

                audio_resp = await client.get(audio_url)
                audio_resp.raise_for_status()
                file_bytes = audio_resp.content

        except httpx.HTTPStatusError as e:
            raise ProviderError("fal", f"HTTP {e.response.status_code}: {e.response.text[:300]}")
        except httpx.RequestError as e:
            raise ProviderError("fal", f"Request failed: {str(e)}")

        ext = "mp3"
        content_type = data.get("audio_file", {}).get("content_type", "")
        if "wav" in content_type:
            ext = "wav"

        return AdapterResponse(
            content=None, file_bytes=file_bytes, file_extension=ext,
            units_used=1, unit_type="audio", raw_response=data,
        )
