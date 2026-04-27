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
        elif request.modality == "audio":
            # Determine if it's TTS (audio output) or STT (audio input -> text output)
            if "whisper" in request.model_id.lower():
                return await self._speech_to_text(request)
            return await self._audio(request)
        raise ValueError(f"OpenAI adapter does not support modality: {request.modality}")

    async def _text(self, request: AdapterRequest) -> AdapterResponse:
        content = [{"type": "text", "text": request.prompt}]
        if request.image_url:
            content.append({
                "type": "image_url",
                "image_url": {"url": request.image_url}
            })

        payload = {
            "model": request.model_id,
            "messages": [{"role": "user", "content": content}],
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

    async def _speech_to_text(self, request: AdapterRequest) -> AdapterResponse:
        if not request.file_url:
            raise ProviderError("openai", "No file_url provided for speech-to-text.")

        try:
            async with httpx.AsyncClient(timeout=120) as client:
                # Download the file first
                file_resp = await client.get(request.file_url)
                file_resp.raise_for_status()
                file_content = file_resp.content
                filename = request.file_url.split("/")[-1]

                files = {"file": (filename, file_content)}
                data = {"model": request.model_id}
                
                resp = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {request.api_key}"},
                    data=data,
                    files=files,
                )
                resp.raise_for_status()
                result = resp.json()
        except httpx.HTTPStatusError as e:
            raise ProviderError("openai", f"HTTP {e.response.status_code}: {e.response.text}")
        except httpx.RequestError as e:
            raise ProviderError("openai", f"Request failed: {str(e)}")

        return AdapterResponse(
            content=result["text"],
            file_bytes=None,
            file_extension=None,
            units_used=1, # simplified
            unit_type="minute",
            raw_response=result,
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

    async def _audio(self, request: AdapterRequest) -> AdapterResponse:
        payload = {
            "model": request.model_id,
            "input": request.prompt,
            "voice": request.params.get("voice", "alloy"),
            "response_format": "mp3",
        }
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    "https://api.openai.com/v1/audio/speech",
                    headers={"Authorization": f"Bearer {request.api_key}"},
                    json=payload,
                )
                resp.raise_for_status()
                file_bytes = resp.content
        except httpx.HTTPStatusError as e:
            raise ProviderError("openai", f"HTTP {e.response.status_code}: {e.response.text[:300]}")
        except httpx.RequestError as e:
            raise ProviderError("openai", f"Request failed: {str(e)}")

        return AdapterResponse(
            content=None,
            file_bytes=file_bytes,
            file_extension="mp3",
            units_used=float(len(request.prompt)),
            unit_type="character",
            raw_response={},
        )
