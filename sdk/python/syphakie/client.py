"""SyphaKie async/sync client."""
from __future__ import annotations
import os
from typing import Any, AsyncIterator, Iterator
from .exceptions import SyphaKieError, AuthError, CreditError, ModelNotFoundError

DEFAULT_BASE = "https://api.syphakie.com"


class SyphaKie:
    """
    Main SyphaKie client.

    Usage:
        client = SyphaKie(api_key="sk-...")
        result = client.generate(modality="image", prompt="a cat in space")
        print(result["output"]["url"])
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        timeout: int = 120,
    ):
        self.api_key = api_key or os.environ.get("SYPHAKIE_API_KEY", "")
        self.base_url = (base_url or os.environ.get("SYPHAKIE_BASE_URL", DEFAULT_BASE)).rstrip("/")
        self.timeout = timeout

    # ── Core generation ──────────────────────────────────────────────────────

    def generate(
        self,
        modality: str,
        prompt: str,
        *,
        model: str | None = None,
        mode: str = "auto",
        task_type: str | None = None,
        max_cost: float | None = None,
        use_cache: bool = True,
        params: dict[str, Any] | None = None,
    ) -> dict:
        """Synchronous generation. Returns the full GenerateResponse dict."""
        import httpx
        body: dict[str, Any] = {"modality": modality, "prompt": prompt, "mode": mode, "use_cache": use_cache}
        if model:
            body["model"] = model
        if task_type:
            body["task_type"] = task_type
        if max_cost is not None:
            body["max_cost"] = max_cost
        if params:
            body["params"] = params
        resp = httpx.post(
            f"{self.base_url}/api/v1/generate",
            json=body,
            headers=self._headers(),
            timeout=self.timeout,
        )
        return self._handle(resp)

    async def generate_async(
        self,
        modality: str,
        prompt: str,
        *,
        model: str | None = None,
        mode: str = "auto",
        task_type: str | None = None,
        max_cost: float | None = None,
        use_cache: bool = True,
        params: dict[str, Any] | None = None,
    ) -> dict:
        """Async generation."""
        import httpx
        body: dict[str, Any] = {"modality": modality, "prompt": prompt, "mode": mode, "use_cache": use_cache}
        if model:
            body["model"] = model
        if task_type:
            body["task_type"] = task_type
        if max_cost is not None:
            body["max_cost"] = max_cost
        if params:
            body["params"] = params
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(f"{self.base_url}/api/v1/generate", json=body, headers=self._headers())
        return self._handle(resp)

    def stream(
        self,
        model: str,
        messages: list[dict[str, str]],
        *,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> Iterator[str]:
        """Stream text tokens via the OpenAI-compatible proxy."""
        import httpx
        import json
        body = {"model": model, "messages": messages, "stream": True}
        if temperature is not None:
            body["temperature"] = temperature
        if max_tokens is not None:
            body["max_tokens"] = max_tokens
        with httpx.stream(
            "POST",
            f"{self.base_url}/api/v1/chat/completions",
            json=body,
            headers=self._headers(),
            timeout=self.timeout,
        ) as resp:
            self._raise_for_status(resp)
            for line in resp.iter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        token = chunk["choices"][0]["delta"].get("content", "")
                        if token:
                            yield token
                    except Exception:
                        pass

    # ── Models ───────────────────────────────────────────────────────────────

    def list_models(self, modality: str | None = None) -> list[dict]:
        import httpx
        qs = f"?modality={modality}" if modality else ""
        resp = httpx.get(f"{self.base_url}/api/v1/models/list{qs}", headers=self._headers(), timeout=30)
        return self._handle(resp).get("models", [])

    def leaderboard(self, modality: str | None = None) -> list[dict]:
        import httpx
        qs = f"?modality={modality}" if modality else ""
        resp = httpx.get(f"{self.base_url}/api/v1/leaderboard{qs}", headers=self._headers(), timeout=30)
        return self._handle(resp).get("leaderboard", [])

    def provider_status(self) -> list[dict]:
        import httpx
        resp = httpx.get(f"{self.base_url}/api/v1/leaderboard/providers", headers=self._headers(), timeout=30)
        return self._handle(resp).get("providers", [])

    # ── Credits ──────────────────────────────────────────────────────────────

    def balance(self) -> int:
        import httpx
        resp = httpx.get(f"{self.base_url}/api/v1/credits", headers=self._headers(), timeout=30)
        return self._handle(resp).get("balance", 0)

    # ── History ──────────────────────────────────────────────────────────────

    def history(self, limit: int = 20) -> list[dict]:
        import httpx
        resp = httpx.get(f"{self.base_url}/api/v1/usage?limit={limit}", headers=self._headers(), timeout=30)
        return self._handle(resp).get("items", [])

    # ── Pipelines ────────────────────────────────────────────────────────────

    def create_pipeline(self, name: str, steps: list[dict], description: str | None = None) -> dict:
        import httpx
        body = {"name": name, "steps": steps}
        if description:
            body["description"] = description
        resp = httpx.post(f"{self.base_url}/api/v1/pipelines", json=body, headers=self._headers(), timeout=30)
        return self._handle(resp).get("pipeline", {})

    def run_pipeline(self, pipeline_id: str, input_prompt: str, params: dict | None = None) -> dict:
        import httpx
        body = {"input_prompt": input_prompt, "params": params or {}}
        resp = httpx.post(f"{self.base_url}/api/v1/pipelines/{pipeline_id}/run", json=body, headers=self._headers(), timeout=self.timeout)
        return self._handle(resp)

    def get_pipeline_run(self, run_id: str) -> dict:
        import httpx
        resp = httpx.get(f"{self.base_url}/api/v1/pipelines/runs/{run_id}", headers=self._headers(), timeout=30)
        return self._handle(resp).get("run", {})

    # ── Webhooks ─────────────────────────────────────────────────────────────

    def create_webhook(self, url: str, events: list[str], secret: str | None = None) -> dict:
        import httpx
        body = {"url": url, "events": events}
        if secret:
            body["secret"] = secret
        resp = httpx.post(f"{self.base_url}/api/v1/webhooks", json=body, headers=self._headers(), timeout=30)
        return self._handle(resp).get("webhook", {})

    def list_webhooks(self) -> list[dict]:
        import httpx
        resp = httpx.get(f"{self.base_url}/api/v1/webhooks", headers=self._headers(), timeout=30)
        return self._handle(resp).get("webhooks", [])

    # ── Rating ───────────────────────────────────────────────────────────────

    def rate(self, request_id: str, rating: int, comment: str | None = None) -> dict:
        import httpx
        body = {"request_id": request_id, "rating": rating}
        if comment:
            body["comment"] = comment
        resp = httpx.post(f"{self.base_url}/api/v1/leaderboard/rate", json=body, headers=self._headers(), timeout=30)
        return self._handle(resp)

    # ── Internals ────────────────────────────────────────────────────────────

    def _headers(self) -> dict:
        return {"X-API-Key": self.api_key, "Content-Type": "application/json"}

    def _handle(self, resp) -> dict:
        self._raise_for_status(resp)
        return resp.json()

    def _raise_for_status(self, resp) -> None:
        if resp.status_code < 400:
            return
        try:
            body = resp.json()
            detail = body.get("detail", {})
            code = detail.get("code") if isinstance(detail, dict) else "ERROR"
            message = (detail.get("message") if isinstance(detail, dict) else str(detail)) or resp.text
        except Exception:
            code, message = "ERROR", resp.text
        if resp.status_code == 401:
            raise AuthError(message, resp.status_code, code)
        if resp.status_code == 402:
            raise CreditError(message, resp.status_code, code)
        if resp.status_code == 404 and code == "MODEL_NOT_FOUND":
            raise ModelNotFoundError(message, resp.status_code, code)
        raise SyphaKieError(message, resp.status_code, code)
