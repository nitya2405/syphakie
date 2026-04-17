# SyphaKie — Implementation Plan

**Version:** 1.0  
**Date:** 2026-04-17  
**Stage:** MVP (text + image, B2B API product)  
**Stack:** FastAPI · PostgreSQL · Local disk storage  

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Folder Structure](#2-folder-structure)
3. [Database Design](#3-database-design)
4. [API Design](#4-api-design)
5. [Routing Engine Design](#5-routing-engine-design)
6. [Provider Adapter System](#6-provider-adapter-system)
7. [Standard Response Format](#7-standard-response-format)
8. [Credit System](#8-credit-system)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Sample Code Snippets](#10-sample-code-snippets)

---

## 1. System Architecture

### High-Level Flow

```
Developer Client
       │
       │  HTTP request (X-API-Key header)
       ▼
┌─────────────────────────────────────────────────────────┐
│                     FastAPI App                         │
│                                                         │
│  ┌──────────────┐    ┌───────────────┐                  │
│  │  Auth Layer  │───▶│  Rate Limiter │                  │
│  │ (API key)    │    │  (future)     │                  │
│  └──────────────┘    └───────────────┘                  │
│          │                                              │
│          ▼                                              │
│  ┌──────────────────────────────────┐                   │
│  │          Request Handler         │                   │
│  │  - validate input schema         │                   │
│  │  - check credits (hard block)    │                   │
│  └──────────────────────────────────┘                   │
│          │                                              │
│          ▼                                              │
│  ┌──────────────────────────────────┐                   │
│  │         Routing Engine           │                   │
│  │  mode=manual → use exact model   │                   │
│  │  mode=auto   → score & select    │                   │
│  └──────────────────────────────────┘                   │
│          │                                              │
│          ▼                                              │
│  ┌──────────────────────────────────┐                   │
│  │      Provider Adapter Layer      │                   │
│  │  OpenAIAdapter │ FalAdapter       │                   │
│  │  StabilityAdapter (optional)     │                   │
│  └──────────────────────────────────┘                   │
│          │                                              │
│          ▼                                              │
│  ┌──────────────────────────────────┐                   │
│  │      Output Normalizer           │                   │
│  │  - save to local disk            │                   │
│  │  - build unified response JSON   │                   │
│  └──────────────────────────────────┘                   │
│          │                                              │
│          ▼                                              │
│  ┌──────────────────────────────────┐                   │
│  │    Post-processing               │                   │
│  │  - deduct credits                │                   │
│  │  - write usage_log row           │                   │
│  └──────────────────────────────────┘                   │
└─────────────────────────────────────────────────────────┘
       │
       ▼
  PostgreSQL DB          Local Disk (/outputs)
```

### Component Responsibilities

| Component | Responsibility |
|---|---|
| **Auth Layer** | Validate `X-API-Key` header, load user + role |
| **Request Handler** | Input validation, credit pre-check |
| **Routing Engine** | Select provider+model based on mode (manual/auto) |
| **Provider Adapters** | Translate unified request → provider API → raw response |
| **Output Normalizer** | Save file to disk, build standard JSON response |
| **Credit System** | Deduct credits, hard-block at zero |
| **Usage Logger** | Write every request outcome to `usage_logs` table |

---

## 2. Folder Structure

```
syphakie/
├── app/
│   ├── main.py                    # FastAPI app factory, router registration
│   ├── config.py                  # Settings via pydantic-settings (.env)
│   │
│   ├── api/                       # HTTP route handlers only — no logic here
│   │   ├── __init__.py
│   │   ├── deps.py                # Shared dependencies (get_current_user, get_db)
│   │   ├── auth.py                # POST /auth/keys
│   │   ├── generate.py            # POST /generate
│   │   ├── models.py              # GET /models/list
│   │   ├── credits.py             # GET /credits, POST /credits/adjust (admin)
│   │   ├── usage.py               # GET /usage
│   │   └── outputs.py             # GET /outputs/{request_id}
│   │
│   ├── core/                      # Business logic that doesn't belong to one service
│   │   ├── __init__.py
│   │   ├── security.py            # API key hashing, generation
│   │   ├── exceptions.py          # Custom HTTP exceptions
│   │   └── logging.py             # Structured logger setup
│   │
│   ├── routing/                   # Routing engine
│   │   ├── __init__.py
│   │   ├── engine.py              # Route selector (manual + auto)
│   │   ├── scorer.py              # Scoring logic: cost/latency/quality
│   │   └── config.py              # Global routing rules (loaded from DB or YAML)
│   │
│   ├── providers/                 # One file per provider
│   │   ├── __init__.py
│   │   ├── base.py                # Abstract BaseAdapter class
│   │   ├── openai_adapter.py      # OpenAI text + image
│   │   ├── fal_adapter.py         # Fal.ai (user-provided key)
│   │   └── stability_adapter.py   # Stability AI (optional MVP)
│   │
│   ├── services/                  # Orchestration layer between API and providers
│   │   ├── __init__.py
│   │   ├── generate.py            # Main generation orchestrator
│   │   ├── credits.py             # Credit check, deduct, balance
│   │   ├── usage.py               # Write usage logs
│   │   └── outputs.py             # Save to disk, build output URL
│   │
│   ├── models/                    # SQLAlchemy ORM models
│   │   ├── __init__.py
│   │   ├── user.py
│   │   ├── api_key.py
│   │   ├── credit.py
│   │   ├── usage_log.py
│   │   ├── request_record.py
│   │   └── model_registry.py
│   │
│   ├── schemas/                   # Pydantic request/response schemas
│   │   ├── __init__.py
│   │   ├── generate.py
│   │   ├── credits.py
│   │   ├── usage.py
│   │   ├── models.py
│   │   └── common.py              # Unified response envelope
│   │
│   └── db/
│       ├── __init__.py
│       ├── session.py             # Async SQLAlchemy engine + session factory
│       └── migrations/            # Alembic migrations
│           └── versions/
│
├── outputs/                       # Generated files stored here (gitignored)
│   └── {user_id}/
│       └── {request_id}/
│           └── result.png / result.txt
│
├── tests/
│   ├── test_routing.py
│   ├── test_adapters.py
│   ├── test_credits.py
│   └── test_generate.py
│
├── .env                           # Local secrets (gitignored)
├── .env.example                   # Template for .env
├── requirements.txt
├── alembic.ini
└── docs/
    └── implementation_plan.md     # This file
```

---

## 3. Database Design

### Schema Overview

**Phase 1 tables (build now):**
```
users ──< api_keys
users ──< credits (1:1)
model_registry (standalone lookup table)
```

**Phase 2 tables (add later):**
```
users ──< request_records
users ──< usage_logs
request_records ──< usage_logs
users ──< user_provider_keys
```

---

### Table: `users`

Stores developer accounts. Created by admin for MVP (no self-signup).

```sql
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       TEXT NOT NULL UNIQUE,
    name        TEXT,
    role        TEXT NOT NULL DEFAULT 'user',   -- 'user' | 'admin'
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### Table: `api_keys`

Each user has exactly one API key for MVP. Stored as a SHA-256 hash.  
The raw key is shown once on creation and never stored again.

```sql
CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_hash    TEXT NOT NULL UNIQUE,    -- SHA-256 of the raw key
    key_prefix  TEXT NOT NULL,           -- first 8 chars, for display ("sk-xxxx...")
    label       TEXT,                    -- optional human name
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    last_used   TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
```

---

### Table: `credits`

One row per user. Balance in integer credits (no decimals).

```sql
CREATE TABLE credits (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    balance     INTEGER NOT NULL DEFAULT 1000,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

### Table: `model_registry`

Single source of truth for all supported models. Routing engine reads from here.

```sql
CREATE TABLE model_registry (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        TEXT NOT NULL,      -- 'openai', 'fal', 'stability'
    model_id        TEXT NOT NULL,      -- 'gpt-4o', 'dall-e-3', etc.
    modality        TEXT NOT NULL,      -- 'text', 'image', 'video', 'music'
    display_name    TEXT NOT NULL,
    cost_per_unit   NUMERIC(10,6) NOT NULL,   -- credits per token/image
    unit_type       TEXT NOT NULL,      -- 'token', 'image', 'second'
    avg_latency_ms  INTEGER,            -- rolling average, updated periodically
    quality_score   NUMERIC(3,2),       -- 0.00–1.00, manually set
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    requires_user_key BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(provider, model_id)
);
```

---

### Table: `user_provider_keys` *(Phase 2)*

User-provided API keys for providers like Fal.ai. Stored as plaintext in Phase 2 (no encryption in MVP); encrypt in Phase 4.

```sql
CREATE TABLE user_provider_keys (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider     TEXT NOT NULL,          -- 'fal', 'stability', etc.
    api_key      TEXT NOT NULL,          -- plaintext for now; encrypt in Phase 4
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, provider)
);
```

---

### Table: `request_records` *(Phase 2)*

Every generation request — regardless of success or failure.

```sql
CREATE TABLE request_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    model_registry_id UUID REFERENCES model_registry(id),
    modality        TEXT NOT NULL,
    routing_mode    TEXT NOT NULL,          -- 'manual' | 'auto'
    status          TEXT NOT NULL,          -- 'pending' | 'success' | 'failed'
    input_payload   JSONB NOT NULL,         -- full request params (no secrets)
    output_path     TEXT,                   -- relative path under /outputs/
    output_url      TEXT,                   -- served URL
    credits_deducted INTEGER NOT NULL DEFAULT 0,
    latency_ms      INTEGER,
    error_message   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ
);

CREATE INDEX idx_request_records_user ON request_records(user_id);
CREATE INDEX idx_request_records_created ON request_records(created_at DESC);
```

---

### Table: `usage_logs` *(Phase 2)*

Granular token/unit accounting per request. One row per request.

```sql
CREATE TABLE usage_logs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id      UUID NOT NULL REFERENCES request_records(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    provider        TEXT NOT NULL,
    model_id        TEXT NOT NULL,
    units_used      NUMERIC(12,4) NOT NULL,   -- tokens, images, seconds
    unit_type       TEXT NOT NULL,
    cost_per_unit   NUMERIC(10,6) NOT NULL,   -- snapshot at time of use
    credits_charged INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usage_logs_user ON usage_logs(user_id);
CREATE INDEX idx_usage_logs_request ON usage_logs(request_id);
```

---

## 4. API Design

**Base URL (MVP):** `http://localhost:8000/api/v1`  
**Auth:** All endpoints require `X-API-Key: sk-...` header except health check.

---

### `POST /generate`

Main entry point for all generation requests.

**Request Body:**
```json
{
  "modality": "text",
  "mode": "auto",
  "prompt": "Explain quantum entanglement in simple terms",
  "model": null,
  "provider": null,
  "params": {
    "max_tokens": 500,
    "temperature": 0.7
  },
  "use_own_key": false
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `modality` | `"text"` \| `"image"` | yes | MVP supports these two |
| `mode` | `"auto"` \| `"manual"` | yes | |
| `prompt` | string | yes | |
| `model` | string | no | Required if `mode=manual` |
| `provider` | string | no | Optional with `mode=manual` |
| `params` | object | no | Provider-specific overrides |
| `use_own_key` | bool | no | Use user's stored provider key |

**Response (success):**
```json
{
  "success": true,
  "request_id": "req_01hw...",
  "modality": "text",
  "provider": "openai",
  "model": "gpt-4o",
  "output": {
    "type": "text",
    "content": "Quantum entanglement is...",
    "url": null
  },
  "meta": {
    "latency_ms": 843,
    "credits_used": 12,
    "credits_remaining": 988,
    "units_used": 247,
    "unit_type": "token"
  }
}
```

**Response (error):**
```json
{
  "success": false,
  "error": {
    "code": "INSUFFICIENT_CREDITS",
    "message": "Your credit balance is 0. Contact admin to top up."
  }
}
```

---

### `GET /models/list`

Returns all active models from `model_registry`.

**Query params:**
- `modality` (optional): filter by `text`, `image`
- `provider` (optional): filter by provider name

**Response:**
```json
{
  "models": [
    {
      "model_id": "gpt-4o",
      "provider": "openai",
      "modality": "text",
      "display_name": "GPT-4o",
      "cost_per_unit": 0.000005,
      "unit_type": "token",
      "avg_latency_ms": 920,
      "quality_score": 0.95,
      "requires_user_key": false
    }
  ]
}
```

---

### `GET /credits`

Returns current credit balance for the authenticated user.

**Response:**
```json
{
  "balance": 988
}
```

---

### `POST /credits/adjust` *(admin only)*

Adjust a user's credit balance.

**Request Body:**
```json
{
  "user_id": "uuid...",
  "amount": 500,
  "reason": "Manual top-up"
}
```

**Response:**
```json
{
  "user_id": "uuid...",
  "new_balance": 1488
}
```

---

### `GET /usage`

Returns usage history for the authenticated user.

**Query params:**
- `limit` (default 20, max 100)
- `offset` (default 0)
- `modality` (optional)
- `from_date`, `to_date` (optional, ISO 8601)

**Response:**
```json
{
  "total": 47,
  "items": [
    {
      "request_id": "req_01hw...",
      "modality": "image",
      "provider": "openai",
      "model": "dall-e-3",
      "status": "success",
      "credits_used": 40,
      "latency_ms": 4200,
      "created_at": "2026-04-17T10:32:00Z"
    }
  ]
}
```

---

### `GET /outputs/{request_id}`

Retrieve a previously generated output.

**Response (success):**
```json
{
  "request_id": "req_01hw...",
  "modality": "image",
  "output": {
    "type": "image",
    "url": "http://localhost:8000/files/user_id/req_01hw.../result.png",
    "content": null
  },
  "created_at": "2026-04-17T10:32:00Z"
}
```

---

### `POST /auth/keys` *(admin only)*

Create a new API key for a user.

**Request Body:**
```json
{
  "user_id": "uuid...",
  "label": "dev-key-1"
}
```

**Response:**
```json
{
  "api_key": "sk-AbCdEfGhIjKlMnOp",
  "key_prefix": "sk-AbCd",
  "message": "Store this key — it will not be shown again."
}
```

---

### `POST /auth/provider-keys`

Let a user store their own API key for a provider (e.g., Fal.ai).

**Request Body:**
```json
{
  "provider": "fal",
  "api_key": "fal-key-xxxx"
}
```

**Response:**
```json
{
  "provider": "fal",
  "stored": true
}
```

---

### `GET /health`

No auth required.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

---

## 5. Routing Engine Design

> **Phase scope:** Phase 1 implements manual mode only. Auto mode is implemented in Phase 3.  
> The engine structure is designed now so Phase 3 only adds a new method — no refactoring needed.

---

### Phase 1: Manual Mode

Bypasses all scoring. User provides `model` (and optionally `provider`).

```
Input: { mode: "manual", model: "dall-e-3", provider: "openai" }
  │
  ├── Look up model_registry WHERE model_id = "dall-e-3"
  ├── Validate: model is active, modality matches
  └── Return: { provider: "openai", model_id: "dall-e-3", cost_per_unit: 40 }
```

If the model is not found or inactive → `404 MODEL_NOT_FOUND`.

---

### Phase 3: Auto Mode

Fetches all active models for the requested modality, scores each, picks the highest.

```
Input: { mode: "auto", modality: "image" }
  │
  ├── Fetch all active models for modality=image from model_registry
  ├── Filter: exclude models requiring user key (unless user has stored one)
  ├── Score each model
  └── Return: highest-scoring model
```

#### Scoring Formula

```python
# All weights are global config, adjustable in routing/config.py
WEIGHT_COST    = 0.4   # lower cost = higher score
WEIGHT_LATENCY = 0.4   # lower latency = higher score
WEIGHT_QUALITY = 0.2   # higher quality = higher score

def score_model(model, max_cost, max_latency):
    cost_score    = 1.0 - (model.cost_per_unit / max_cost)
    latency_score = 1.0 - (model.avg_latency_ms / max_latency)
    quality_score = model.quality_score or 0.5

    return (
        WEIGHT_COST    * cost_score +
        WEIGHT_LATENCY * latency_score +
        WEIGHT_QUALITY * quality_score
    )
```

**Balanced default:** `WEIGHT_COST=0.4, WEIGHT_LATENCY=0.4, WEIGHT_QUALITY=0.2`

---

### Routing Config (`routing/config.py`)

Write this file in Phase 1 as a stub. Phase 3 fills in the auto-mode values.

```python
class RoutingConfig:
    DEFAULT_MODE = "manual"   # Phase 1: manual only

    # Phase 3: activate auto mode
    AUTO_WEIGHTS = {
        "cost": 0.4,
        "latency": 0.4,
        "quality": 0.2,
    }

    BLACKLISTED_PROVIDERS: list[str] = []
    PREFERRED_PROVIDER: dict[str, str] = {}
```

---

### Engine Extension Path (Phase 1 → Phase 3)

Phase 1 `RoutingEngine` raises `400` if `mode=auto` is requested — it's not yet supported.  
Phase 3 adds `_auto()` without touching the existing `_manual()` path:

```python
class RoutingEngine:
    def select(self, request, user) -> SelectedModel:
        if request.mode == "manual":
            return self._manual(request)
        elif request.mode == "auto":
            return self._auto(request, user)   # added in Phase 3
        raise ValueError(f"Unsupported routing mode: {request.mode}")
```

---

## 6. Provider Adapter System

### Base Interface

Every adapter must implement this interface:

```python
# app/providers/base.py

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

@dataclass
class AdapterRequest:
    modality: str           # 'text' | 'image'
    prompt: str
    model_id: str
    params: dict[str, Any]
    api_key: str            # either system key or user-provided key

@dataclass
class AdapterResponse:
    content: str | None      # for text responses
    file_bytes: bytes | None # for image/audio/video
    file_extension: str | None  # 'png', 'jpg', etc.
    units_used: float        # tokens, images, seconds
    unit_type: str           # 'token', 'image', 'second'
    raw_response: dict       # full provider response, for debugging

class BaseAdapter(ABC):
    provider_name: str  # must be set on each subclass

    @abstractmethod
    async def generate(self, request: AdapterRequest) -> AdapterResponse:
        ...

    @abstractmethod
    def get_api_key(self) -> str:
        # return system key from config, subclasses can override for user keys
        ...
```

---

### Adapter: OpenAI

```
Handles: text (gpt-4o, gpt-3.5-turbo) + image (dall-e-3, dall-e-2)
Key source: system (OPENAI_API_KEY in .env)
```

**Text flow:**
1. Call `POST https://api.openai.com/v1/chat/completions`
2. Extract `choices[0].message.content`
3. Extract `usage.total_tokens` → units_used
4. Return `AdapterResponse(content=..., file_bytes=None, units_used=total_tokens, unit_type='token')`

**Image flow:**
1. Call `POST https://api.openai.com/v1/images/generations`
2. Download image bytes from returned URL
3. Return `AdapterResponse(content=None, file_bytes=..., file_extension='png', units_used=1, unit_type='image')`

---

### Adapter: Fal.ai

```
Handles: image (user specifies model, e.g., fal-ai/flux/schnell)
Key source: user-provided (from user_provider_keys table, decrypted at runtime)
```

**Flow:**
1. Decrypt user's Fal key from DB
2. Call Fal REST API with user key
3. Download result file
4. Return normalized `AdapterResponse`

---

### Adapter: Stability AI (optional MVP)

```
Handles: image (stable-diffusion-3)
Key source: system (STABILITY_API_KEY in .env)
```

---

### Adding a New Provider (Checklist)

1. Create `app/providers/{name}_adapter.py`, subclass `BaseAdapter`
2. Implement `generate()` and `get_api_key()`
3. Register the adapter in `app/providers/__init__.py` registry dict
4. Seed new rows into `model_registry` for each supported model
5. Done — routing engine auto-discovers it from DB

**Adapter registry:**
```python
# app/providers/__init__.py
from .openai_adapter import OpenAIAdapter
from .fal_adapter import FalAdapter
from .stability_adapter import StabilityAdapter

ADAPTER_REGISTRY: dict[str, type[BaseAdapter]] = {
    "openai": OpenAIAdapter,
    "fal": FalAdapter,
    "stability": StabilityAdapter,
}

def get_adapter(provider: str) -> BaseAdapter:
    if provider not in ADAPTER_REGISTRY:
        raise ValueError(f"No adapter for provider: {provider}")
    return ADAPTER_REGISTRY[provider]()
```

---

## 7. Standard Response Format

Every `/generate` response — regardless of provider or modality — returns this envelope:

```json
{
  "success": true,
  "request_id": "req_01hw9xyz",
  "modality": "image",
  "provider": "openai",
  "model": "dall-e-3",
  "output": {
    "type": "image",
    "content": null,
    "url": "http://localhost:8000/files/user_abc/req_01hw9xyz/result.png",
    "mime_type": "image/png",
    "file_size_bytes": 204800
  },
  "meta": {
    "latency_ms": 4230,
    "credits_used": 40,
    "credits_remaining": 960,
    "units_used": 1,
    "unit_type": "image",
    "routing_mode": "auto"
  }
}
```

### Output Field Rules by Modality

| Modality | `content` | `url` | `mime_type` |
|---|---|---|---|
| `text` | Full text string | `null` | `null` |
| `image` | `null` | Local file URL | `image/png` or `image/jpeg` |
| `video` *(future)* | `null` | Local file URL | `video/mp4` |
| `music` *(future)* | `null` | Local file URL | `audio/mpeg` |

### Error Envelope

```json
{
  "success": false,
  "request_id": "req_01hw9xyz",
  "error": {
    "code": "PROVIDER_ERROR",
    "message": "OpenAI returned 429: rate limit exceeded",
    "provider": "openai"
  }
}
```

**Error codes:**

| Code | HTTP Status | Meaning |
|---|---|---|
| `INVALID_API_KEY` | 401 | Key not found or inactive |
| `INSUFFICIENT_CREDITS` | 402 | Balance is zero |
| `MODEL_NOT_FOUND` | 404 | model_id not in registry |
| `MISSING_PROVIDER_KEY` | 400 | Model needs user key, none stored |
| `PROVIDER_ERROR` | 502 | Upstream API failed |
| `VALIDATION_ERROR` | 422 | Bad request body |
| `FORBIDDEN` | 403 | Role doesn't allow this action |

---

## 8. Credit System

### Credit Values (seed data)

| Model | Provider | Cost |
|---|---|---|
| `gpt-4o` | openai | 5 credits / 1000 tokens |
| `gpt-3.5-turbo` | openai | 1 credit / 1000 tokens |
| `dall-e-3` | openai | 40 credits / image |
| `dall-e-2` | openai | 15 credits / image |
| `fal-ai/flux/schnell` | fal | 10 credits / image |
| `stable-diffusion-3` | stability | 20 credits / image |

Cost values in `model_registry.cost_per_unit` are per single unit (token or image).

---

### Credit Calculation

```python
def calculate_credits(units_used: float, cost_per_unit: float) -> int:
    raw = units_used * cost_per_unit
    return max(1, math.ceil(raw))   # minimum 1 credit per request
```

For text: `units_used = total_tokens`, `cost_per_unit = credits_per_token`  
For image: `units_used = 1`, `cost_per_unit = credits_per_image`

---

### Cost Estimation (pre-generation)

Before calling the provider, estimate the cost using known maximums from `model_registry`.  
This lets us hard-block the request before wasting a provider call.

```python
def estimate_credits(modality: str, model: ModelRegistry, params: dict) -> int:
    if modality == "image":
        return int(model.cost_per_unit)   # always 1 image = fixed cost

    if modality == "text":
        # Use max_tokens from params, or a conservative default
        max_tokens = params.get("max_tokens", 1000)
        # Estimate: prompt (~200 tokens) + completion
        estimated_tokens = 200 + max_tokens
        return max(1, math.ceil(estimated_tokens * model.cost_per_unit))
```

The estimate is intentionally conservative (rounds up). The actual deduction after generation uses real token counts.

---

### Credit Flow (per request)

```
1. ESTIMATE
   estimated = estimate_credits(modality, model, params)
   IF balance < estimated:
       raise HTTP 402 INSUFFICIENT_CREDITS
   (Blocks before provider call — no wasted API spend)

2. PRE-DEDUCT
   UPDATE credits
   SET balance = balance - estimated, updated_at = NOW()
   WHERE user_id = ? AND balance >= estimated
   (Deduct upfront — prevents parallel requests from overdrafting)

3. GENERATE
   Call provider adapter
   → On provider failure: refund estimated credits, re-raise error

4. ADJUST (only on success)
   actual = calculate_credits(units_used, cost_per_unit)
   adjustment = estimated - actual   -- positive = refund, negative = extra charge

   UPDATE credits
   SET balance = balance + adjustment, updated_at = NOW()
   WHERE user_id = ?

   final_deducted = actual
```

**On provider failure:** The pre-deducted amount is refunded in full.  
**On success:** User pays actual cost, not the estimate. Overpayment is returned.

---

> **Phase 2 addition:** After step 4, write a row to `usage_logs` with the final `credits_charged`.

---

### Admin Credit Adjustment

```
POST /credits/adjust
Body: { user_id, amount (+/-), reason }

UPDATE credits SET balance = balance + amount WHERE user_id = ?
```

Amount can be negative (for corrections). Balance floor is 0 (enforced in code).

---

## 9. Implementation Roadmap

### Phase 1 — MVP (Week 1–2)

**Goal:** Working local API — text and image generation via OpenAI, credits deducted, outputs stored.

**Setup**
- [ ] Project scaffold: FastAPI, PostgreSQL, SQLAlchemy, Alembic
- [ ] `.env` + `pydantic-settings` config (`OPENAI_API_KEY`, `DATABASE_URL`, `OUTPUT_DIR`, `BASE_URL`)
- [ ] Database: create Phase 1 tables only (`users`, `api_keys`, `credits`, `model_registry`)
- [ ] First Alembic migration: `alembic revision --autogenerate -m "init"` + `alembic upgrade head`

**Seed + Bootstrap**
- [ ] Seed `model_registry` with OpenAI-only models (gpt-4o, gpt-3.5-turbo, dall-e-3, dall-e-2)
- [ ] Bootstrap script: create admin user + generate API key + assign 1000 credits (see Section 10)

**Auth**
- [ ] `X-API-Key` middleware: hash incoming key, look up `api_keys`, load user
- [ ] `POST /api/v1/auth/keys` (admin only): create user + generate + return raw key once

**Core Generation**
- [ ] `BaseAdapter` interface (`app/providers/base.py`)
- [ ] `OpenAIAdapter`: text (chat completions) + image (dall-e-3, dall-e-2)
- [ ] `RoutingEngine`: manual mode only — validate model exists in registry, return `SelectedModel`
- [ ] `CreditService`: `estimate_credits()`, pre-deduct, post-adjust, `get_balance()`
- [ ] `OutputService`: save to `outputs/{user_id}/{request_id}/`, return URL
- [ ] `GenerationService`: wire together routing → key resolve → adapter → output → credits
- [ ] `POST /generate` endpoint

**Retrieval + Discovery**
- [ ] `GET /outputs/{request_id}` — look up path from in-memory or file structure
- [ ] `GET /models/list` — query `model_registry`, support `?modality=` filter
- [ ] `GET /credits` — return `{ balance }`
- [ ] `GET /health`

**Done when:** `POST /generate` returns a real OpenAI response, file is saved to disk, credits are deducted from balance, output is retrievable by request_id.

---

### Phase 2 — Logging + Fal.ai + Admin Controls (Week 3)

**Goal:** Every request tracked, full usage history, Fal.ai working with user-supplied keys.

**Database**
- [ ] Add `request_records` table + migration
- [ ] Add `usage_logs` table + migration
- [ ] Add `user_provider_keys` table + migration (plaintext key for now)

**Request Tracking**
- [ ] Write `request_records` row at start of each request (status=`pending`)
- [ ] Update row on success/failure (`status`, `output_url`, `credits_deducted`, `latency_ms`)
- [ ] Write `usage_logs` row on every successful generation
- [ ] On provider failure: write failed row, refund credits, return standard error

**Endpoints**
- [ ] `GET /usage` — paginated history from `request_records`, support `?modality=&from_date=&to_date=`
- [ ] `POST /credits/adjust` (admin) — adjust any user's balance
- [ ] `POST /auth/provider-keys` — store user's Fal.ai key in `user_provider_keys`

**Fal.ai Integration**
- [ ] `FalAdapter` implementation (image generation)
- [ ] Seed Fal.ai models in `model_registry` (`requires_user_key=True`)
- [ ] `ProviderKeyService.get_key(user_id, provider)` — read from `user_provider_keys`
- [ ] Update `_resolve_key()` in `GenerationService` to use `ProviderKeyService` for user keys
- [ ] Test Fal.ai image generation end-to-end

**Error handling**
- [ ] Map provider HTTP errors to standard error codes (`PROVIDER_ERROR`, `PROVIDER_RATE_LIMIT`)
- [ ] Ensure failed requests always write a `request_records` row

**Done when:** Every request (success + failure) is logged, Fal.ai works with user-provided keys, admin can adjust credits.

---

### Phase 3 — Auto Routing (Week 4)

**Goal:** `mode=auto` works end-to-end using the scoring engine. Users no longer need to know which model to pick.

**Routing Engine**
- [ ] Implement `_auto()` in `RoutingEngine` with full scoring formula (cost + latency + quality)
- [ ] Implement `scorer.py`: `score_model(model, max_cost, max_latency) -> float`
- [ ] Activate `mode=auto` in `/generate` — remove the `400 Unsupported mode` guard
- [ ] Filter out models requiring user keys that the user hasn't stored
- [ ] Update `RoutingConfig` with real weight values (default: balanced 0.4/0.4/0.2)

**Latency Data**
- [ ] Script `scripts/update_latency.py`: read `usage_logs`, compute rolling avg, update `model_registry.avg_latency_ms`
- [ ] Run manually after Phase 2 generates enough data

**Admin Controls**
- [ ] `PATCH /admin/models/{model_id}`: update `quality_score`, `is_active`, `avg_latency_ms`
- [ ] `GET /admin/models` with full registry details (cost, latency, quality, active status)

**Stability AI (optional)**
- [ ] `StabilityAdapter` implementation
- [ ] Seed Stability models in `model_registry`

**Testing**
- [ ] Integration test: auto mode with 3 models — verify highest-scoring model is selected
- [ ] Integration test: auto mode excludes user-key models when key not stored

**Done when:** `mode=auto` selects the correct model based on scoring weights, latency data is populated, and admin can tune model scores.

---

### Phase 4 — Hardening + Scale Prep (Post-MVP)

**Goal:** Ready for external developer testing (beta).

- [ ] Move to async DB driver (`asyncpg`)
- [ ] Request timeout enforcement per provider
- [ ] Credit reservation lock (prevents race condition under load)
- [ ] API key rotation endpoint
- [ ] Rate limiting per user (slowapi or custom middleware)
- [ ] Docker + docker-compose setup
- [ ] Centralized structured logging (JSON logs → file)
- [ ] `/models/{id}` detail endpoint
- [ ] Postman collection / OpenAPI spec export
- [ ] Move outputs to S3-compatible storage (MinIO locally, S3 in prod)

---

## 10. Sample Code Snippets

### `app/main.py`

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from app.api import auth, generate, models, credits, usage, outputs
from app.core.exceptions import register_exception_handlers
from app.config import settings

def create_app() -> FastAPI:
    app = FastAPI(
        title="SyphaKie",
        version="0.1.0",
        docs_url="/docs",
        redoc_url=None,
    )

    app.include_router(auth.router,     prefix="/api/v1/auth",    tags=["Auth"])
    app.include_router(generate.router, prefix="/api/v1",         tags=["Generate"])
    app.include_router(models.router,   prefix="/api/v1/models",  tags=["Models"])
    app.include_router(credits.router,  prefix="/api/v1/credits", tags=["Credits"])
    app.include_router(usage.router,    prefix="/api/v1/usage",   tags=["Usage"])
    app.include_router(outputs.router,  prefix="/api/v1/outputs", tags=["Outputs"])

    app.mount("/files", StaticFiles(directory=settings.OUTPUT_DIR), name="files")

    register_exception_handlers(app)

    return app

app = create_app()
```

---

### `app/config.py`

```python
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    DATABASE_URL: str = "postgresql://syphakie:syphakie@localhost:5432/syphakie"

    # Provider keys (Phase 1: OpenAI only)
    OPENAI_API_KEY: str
    STABILITY_API_KEY: str = ""  # Phase 3

    # Storage
    OUTPUT_DIR: str = "outputs"
    BASE_URL: str = "http://localhost:8000"

    # App
    DEFAULT_CREDITS: int = 1000

settings = Settings()
```

---

### `app/api/generate.py`

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.schemas.generate import GenerateRequest, GenerateResponse
from app.services.generate import GenerationService
from app.models.user import User

router = APIRouter()

@router.post("/generate", response_model=GenerateResponse)
async def generate(
    body: GenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = GenerationService(db)
    result = await service.run(user=current_user, request=body)
    return result
```

---

### `app/services/generate.py`

> Phase 1 version — no usage logging, no request_records. Phase 2 adds those.

```python
import time
import uuid
from sqlalchemy.orm import Session
from app.schemas.generate import GenerateRequest, GenerateResponse
from app.models.user import User
from app.services.credits import CreditService
from app.services.outputs import OutputService
from app.routing.engine import RoutingEngine
from app.providers import get_adapter
from app.providers.base import AdapterRequest
from app.core.exceptions import ProviderError

class GenerationService:
    def __init__(self, db: Session):
        self.db = db
        self.router = RoutingEngine(db)
        self.credit_svc = CreditService(db)
        self.output_svc = OutputService()

    async def run(self, user: User, request: GenerateRequest) -> GenerateResponse:
        # 1. Route — get selected model + cost info
        selected = self.router.select(request, user)

        # 2. Estimate cost and pre-deduct (hard block if insufficient)
        estimated = self.credit_svc.estimate_and_prededuct(
            user_id=user.id,
            modality=request.modality,
            model=selected,
            params=request.params or {},
        )

        # 3. Call provider adapter
        api_key = self._resolve_key(selected.provider)
        adapter = get_adapter(selected.provider)
        adapter_req = AdapterRequest(
            modality=request.modality,
            prompt=request.prompt,
            model_id=selected.model_id,
            params=request.params or {},
            api_key=api_key,
        )

        start = time.monotonic()
        try:
            adapter_resp = await adapter.generate(adapter_req)
        except Exception as e:
            # Refund the pre-deducted estimate on provider failure
            self.credit_svc.refund(user.id, estimated)
            raise ProviderError(selected.provider, str(e)) from e
        latency_ms = int((time.monotonic() - start) * 1000)

        # 4. Adjust credits to actual cost
        actual = self.credit_svc.adjust_to_actual(
            user_id=user.id,
            estimated=estimated,
            units_used=adapter_resp.units_used,
            cost_per_unit=selected.cost_per_unit,
        )
        remaining = self.credit_svc.get_balance(user.id)

        # 5. Save output to disk
        request_id = str(uuid.uuid4())
        output_url = self.output_svc.save(
            user_id=str(user.id),
            request_id=request_id,
            modality=request.modality,
            content=adapter_resp.content,
            file_bytes=adapter_resp.file_bytes,
            file_extension=adapter_resp.file_extension,
        )

        return GenerateResponse(
            success=True,
            request_id=request_id,
            modality=request.modality,
            provider=selected.provider,
            model=selected.model_id,
            output={
                "type": request.modality,
                "content": adapter_resp.content,
                "url": output_url,
                "mime_type": f"image/{adapter_resp.file_extension}" if adapter_resp.file_bytes else None,
            },
            meta={
                "latency_ms": latency_ms,
                "credits_used": actual,
                "credits_remaining": remaining,
                "units_used": adapter_resp.units_used,
                "unit_type": adapter_resp.unit_type,
                "routing_mode": request.mode,
            },
        )

    def _resolve_key(self, provider: str) -> str:
        from app.config import settings
        key_map = {
            "openai": settings.OPENAI_API_KEY,
        }
        if provider not in key_map or not key_map[provider]:
            raise ValueError(f"No system key configured for provider: {provider}")
        return key_map[provider]
```

---

### `app/providers/openai_adapter.py`

```python
import httpx
from app.providers.base import BaseAdapter, AdapterRequest, AdapterResponse

class OpenAIAdapter(BaseAdapter):
    provider_name = "openai"

    async def generate(self, request: AdapterRequest) -> AdapterResponse:
        if request.modality == "text":
            return await self._text(request)
        elif request.modality == "image":
            return await self._image(request)
        raise ValueError(f"OpenAI adapter does not support modality: {request.modality}")

    async def _text(self, request: AdapterRequest) -> AdapterResponse:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {request.api_key}"},
                json={
                    "model": request.model_id,
                    "messages": [{"role": "user", "content": request.prompt}],
                    **request.params,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        return AdapterResponse(
            content=data["choices"][0]["message"]["content"],
            file_bytes=None,
            file_extension=None,
            units_used=data["usage"]["total_tokens"],
            unit_type="token",
            raw_response=data,
        )

    async def _image(self, request: AdapterRequest) -> AdapterResponse:
        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                "https://api.openai.com/v1/images/generations",
                headers={"Authorization": f"Bearer {request.api_key}"},
                json={
                    "model": request.model_id,
                    "prompt": request.prompt,
                    "n": 1,
                    "response_format": "url",
                    **request.params,
                },
            )
            resp.raise_for_status()
            data = resp.json()

            image_url = data["data"][0]["url"]
            image_resp = await client.get(image_url)
            image_resp.raise_for_status()

        return AdapterResponse(
            content=None,
            file_bytes=image_resp.content,
            file_extension="png",
            units_used=1,
            unit_type="image",
            raw_response=data,
        )
```

---

### `app/routing/engine.py`

> Phase 1 version — manual mode only. `_auto()` is stubbed and enabled in Phase 3.

```python
from sqlalchemy.orm import Session
from app.models.model_registry import ModelRegistry
from app.schemas.generate import GenerateRequest
from app.models.user import User
from app.core.exceptions import ModelNotFoundError
from dataclasses import dataclass
from fastapi import HTTPException

@dataclass
class SelectedModel:
    provider: str
    model_id: str
    cost_per_unit: float
    unit_type: str

class RoutingEngine:
    def __init__(self, db: Session):
        self.db = db

    def select(self, request: GenerateRequest, user: User) -> SelectedModel:
        if request.mode == "manual":
            return self._manual(request)
        raise HTTPException(status_code=400, detail="mode=auto is not yet supported. Use mode=manual.")

    def _manual(self, request: GenerateRequest) -> SelectedModel:
        if not request.model:
            raise HTTPException(status_code=400, detail="mode=manual requires a 'model' field.")

        query = self.db.query(ModelRegistry).filter(
            ModelRegistry.model_id == request.model,
            ModelRegistry.is_active == True,
        )
        if request.provider:
            query = query.filter(ModelRegistry.provider == request.provider)

        model = query.first()
        if not model:
            raise ModelNotFoundError(request.model)

        return SelectedModel(model.provider, model.model_id, float(model.cost_per_unit), model.unit_type)

    # Phase 3: implement _auto() here
```

---

### `.env.example`

```env
DATABASE_URL=postgresql://syphakie:syphakie@localhost:5432/syphakie

# Phase 1: only OpenAI needed
OPENAI_API_KEY=sk-...

# Phase 3: add when Stability AI is integrated
# STABILITY_API_KEY=

OUTPUT_DIR=outputs
BASE_URL=http://localhost:8000
```

---

### Database Seed Script (`scripts/seed.py`)

> Phase 1: OpenAI models only. Add Fal.ai entries in Phase 2.

```python
"""Run once after migrations to populate model_registry."""
from app.db.session import SessionLocal
from app.models.model_registry import ModelRegistry

MODELS = [
    # Text
    dict(provider="openai", model_id="gpt-4o",        modality="text",  display_name="GPT-4o",
         cost_per_unit=0.005, unit_type="token", avg_latency_ms=900,  quality_score=0.95),
    dict(provider="openai", model_id="gpt-3.5-turbo", modality="text",  display_name="GPT-3.5 Turbo",
         cost_per_unit=0.001, unit_type="token", avg_latency_ms=400,  quality_score=0.75),
    # Image
    dict(provider="openai", model_id="dall-e-3",      modality="image", display_name="DALL-E 3",
         cost_per_unit=40,    unit_type="image", avg_latency_ms=5000, quality_score=0.92),
    dict(provider="openai", model_id="dall-e-2",      modality="image", display_name="DALL-E 2",
         cost_per_unit=15,    unit_type="image", avg_latency_ms=3000, quality_score=0.70),
    # Phase 2: add Fal.ai entries here
    # dict(provider="fal", model_id="fal-ai/flux/schnell", ...)
]

def seed():
    db = SessionLocal()
    for m in MODELS:
        exists = db.query(ModelRegistry).filter_by(
            provider=m["provider"], model_id=m["model_id"]
        ).first()
        if not exists:
            db.add(ModelRegistry(**m))
    db.commit()
    db.close()
    print("Seeded model_registry.")

if __name__ == "__main__":
    seed()
```

---

## Appendix: Quick Start

```bash
# 1. Create virtual environment
python -m venv venv && source venv/bin/activate  # Windows: venv\Scripts\activate

# 2. Install dependencies
pip install fastapi uvicorn sqlalchemy psycopg2-binary alembic \
            pydantic-settings httpx python-dotenv

# 3. Create PostgreSQL database
createdb syphakie

# 4. Copy and fill .env
cp .env.example .env
# Set OPENAI_API_KEY in .env

# 5. Run migrations
alembic upgrade head

# 6. Seed models
python scripts/seed.py

# 7. Bootstrap: create admin user + API key
python scripts/bootstrap.py

# 8. Start server
uvicorn app.main:app --reload --port 8000

# 9. Test it
curl -X POST http://localhost:8000/api/v1/generate \
  -H "X-API-Key: sk-<key from step 7>" \
  -H "Content-Type: application/json" \
  -d '{"modality":"text","mode":"manual","model":"gpt-4o","prompt":"Hello world"}'
```

---

### Bootstrap Script (`scripts/bootstrap.py`)

Run once after migrations to create the first admin user and generate a working API key.

```python
"""
Creates the first admin user, generates an API key, and assigns starting credits.
Prints the raw API key once — copy it, it will not be shown again.
"""
import hashlib
import secrets
import sys
from app.db.session import SessionLocal
from app.models.user import User
from app.models.api_key import ApiKey
from app.models.credit import Credit
from app.config import settings

def bootstrap(email: str, name: str = "Admin"):
    db = SessionLocal()

    existing = db.query(User).filter_by(email=email).first()
    if existing:
        print(f"User {email} already exists. Skipping.")
        db.close()
        return

    # Create admin user
    user = User(email=email, name=name, role="admin", is_active=True)
    db.add(user)
    db.flush()

    # Generate API key
    raw_key = "sk-" + secrets.token_urlsafe(24)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:8]

    api_key = ApiKey(
        user_id=user.id,
        key_hash=key_hash,
        key_prefix=key_prefix,
        label="bootstrap-admin-key",
        is_active=True,
    )
    db.add(api_key)

    # Assign starting credits
    credit = Credit(user_id=user.id, balance=settings.DEFAULT_CREDITS)
    db.add(credit)

    db.commit()
    db.close()

    print("=" * 60)
    print(f"Admin user created: {email}")
    print(f"API Key (save this — shown once): {raw_key}")
    print(f"Starting credits: {settings.DEFAULT_CREDITS}")
    print("=" * 60)

if __name__ == "__main__":
    email = sys.argv[1] if len(sys.argv) > 1 else "admin@syphakie.local"
    bootstrap(email)
```

**Usage:**
```bash
python scripts/bootstrap.py admin@syphakie.local
```
