import httpx
from app.providers.base import BaseAdapter, AdapterRequest, AdapterResponse
from app.core.exceptions import ProviderError

_BASE = "https://api.elevenlabs.io/v1"
_DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"  # Rachel


class ElevenLabsAdapter(BaseAdapter):
    provider_name = "elevenlabs"

    async def generate(self, request: AdapterRequest) -> AdapterResponse:
        if request.modality == "audio":
            return await self._tts(request)
        raise ValueError(f"ElevenLabs adapter does not support modality: {request.modality}")

    async def _tts(self, request: AdapterRequest) -> AdapterResponse:
        voice_id = request.params.get("voice_id", _DEFAULT_VOICE_ID)
        payload = {
            "text": request.prompt,
            "model_id": request.model_id,
            "voice_settings": {
                "stability": float(request.params.get("stability", 0.5)),
                "similarity_boost": float(request.params.get("similarity_boost", 0.75)),
            },
        }
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                resp = await client.post(
                    f"{_BASE}/text-to-speech/{voice_id}",
                    headers={
                        "xi-api-key": request.api_key,
                        "Content-Type": "application/json",
                        "Accept": "audio/mpeg",
                    },
                    json=payload,
                )
                resp.raise_for_status()
                file_bytes = resp.content
        except httpx.HTTPStatusError as e:
            raise ProviderError("elevenlabs", f"HTTP {e.response.status_code}: {e.response.text[:300]}")
        except httpx.RequestError as e:
            raise ProviderError("elevenlabs", f"Request failed: {str(e)}")

        return AdapterResponse(
            content=None,
            file_bytes=file_bytes,
            file_extension="mp3",
            units_used=float(len(request.prompt)),
            unit_type="character",
            raw_response={},
        )
