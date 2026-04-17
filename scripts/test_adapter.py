"""
Quick test for the OpenAI adapter — runs outside FastAPI.
Usage:
    python scripts/test_adapter.py text
    python scripts/test_adapter.py image
"""
import sys
import os
import asyncio

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.providers.openai_adapter import OpenAIAdapter
from app.providers.base import AdapterRequest
from app.config import settings


async def test_text():
    adapter = OpenAIAdapter()
    req = AdapterRequest(
        modality="text",
        prompt="Say hello in exactly 5 words.",
        model_id="gpt-3.5-turbo",
        params={"max_tokens": 20},
        api_key=settings.OPENAI_API_KEY,
    )
    resp = await adapter.generate(req)
    print("=== TEXT RESPONSE ===")
    print(f"Content    : {resp.content}")
    print(f"Units used : {resp.units_used} tokens")


async def test_image():
    adapter = OpenAIAdapter()
    req = AdapterRequest(
        modality="image",
        prompt="A red apple on a white table, minimal style",
        model_id="dall-e-2",
        params={"size": "256x256"},
        api_key=settings.OPENAI_API_KEY,
    )
    resp = await adapter.generate(req)
    print("=== IMAGE RESPONSE ===")
    print(f"File bytes : {len(resp.file_bytes)} bytes")
    print(f"Extension  : {resp.file_extension}")
    print(f"Units used : {resp.units_used} image")

    # Save to disk so you can open it
    out_path = "outputs/test_image.png"
    os.makedirs("outputs", exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(resp.file_bytes)
    print(f"Saved to   : {out_path}")


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "text"
    if mode == "image":
        asyncio.run(test_image())
    else:
        asyncio.run(test_text())
