# SyphaKie — Scale-Up Plan

**Status:** Backend MVP complete (Phases 1–3 done)  
**Goal:** Turn SyphaKie into a usable product AND a developer platform  
**Rule:** No redesigns. Every phase builds on top of what exists.

---

## What SyphaKie Is Becoming

SyphaKie is a **dual-surface AI model aggregator**:

| Surface | Who | How |
|---------|-----|-----|
| **UI Product** | End users, creators | Next.js web app — generate, browse history, manage settings |
| **API Platform** | Developers, teams | REST API with key auth, usage dashboard, docs |

The backend already supports both. The API is feature-complete for developers today. The UI is what makes it accessible to everyone else. Both share the same FastAPI backend — no split.

---

## Current State (Phases 1–3 Complete)

- FastAPI backend, PostgreSQL, Alembic migrations
- SHA-256 hashed API key auth
- Credit system with pre-deduction and refunds
- OpenAI (text + image) and Fal.ai (image) adapters
- Manual and auto routing with weighted scoring
- Output storage (local disk, static file serving)
- Full audit trail: request_records + usage_logs
- Admin endpoints: model activation, cost/latency/quality overrides
- Latency self-update script (scripts/update_latency.py)

---

## Phase 4 — Productization (UI Foundation)

**Goal:** Ship a working web UI. Users can generate, view history, manage their account.  
**Timeline:** 1.5–2 weeks

### Frontend

**Stack:** Next.js 14 (App Router), Tailwind CSS, shadcn/ui, React Query

**Pages:**

| Route | Purpose |
|-------|---------|
| `/` | Landing / login redirect |
| `/generate` | Main generation UI |
| `/history` | Past requests with outputs |
| `/settings` | API key display, provider keys, credit balance |
| `/login` | API key entry (no OAuth yet) |

**`/generate` page:**
- Modality selector (Text / Image)
- Mode selector (Manual / Auto)
- Model + provider dropdowns (populated from `GET /api/v1/models`)
- Prompt textarea
- Submit → loading state → output display (text inline, image rendered)
- Credits used shown after each response

**`/history` page:**
- Table from `GET /api/v1/outputs` + `GET /api/v1/usage`
- Filter by modality, date range
- Click row → expand output

**`/settings` page:**
- Show API key (masked, copy button)
- Credit balance from `GET /api/v1/credits/balance`
- Provider key management (Fal, Stability)
- Link to API docs

### Backend Changes

- Add `GET /api/v1/credits/balance` — return `{ balance: int }` *(if not already present)*
- Add `GET /api/v1/outputs/{request_id}` — single output detail
- Add CORS middleware to FastAPI for `localhost:3000` and production domain

```python
# main.py addition
from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3000"], ...)
```

- Return `credits_remaining` in every `/generate` response — already done via `meta.credits_remaining`

### Infra

- `frontend/` directory at repo root (Next.js project)
- `.env.local` for `NEXT_PUBLIC_API_URL`
- Run backend and frontend as separate processes locally

### Success Criteria

- [ ] User can generate text and image from browser
- [ ] History shows last 20 requests
- [ ] Credit balance visible
- [ ] No console errors, no broken states on empty history

---

## Phase 5 — Developer Platform

**Goal:** Make the API a first-class product. Developers can self-serve: explore models, manage keys, read docs, understand their usage.  
**Timeline:** 1–1.5 weeks

### Frontend

**New Pages:**

| Route | Purpose |
|-------|---------|
| `/dashboard` | Usage charts, credit burn, request volume |
| `/models` | Model explorer — browse all active models, metadata |
| `/docs` | Embedded API docs (Swagger or custom) |
| `/keys` | API key display + future: multi-key management |

**`/dashboard` breakdown:**
- Total requests this month
- Credits used vs remaining (bar or gauge)
- Requests by modality (pie)
- Daily request volume (line chart) — from `GET /api/v1/usage` with date range

**`/models` page:**
- Table: model_id, provider, modality, cost/unit, latency, quality score, status
- Filter by modality
- "Try it" button → redirects to `/generate` with model pre-selected

### Backend Changes

- `GET /api/v1/usage/summary` — aggregate stats:
  ```json
  {
    "total_requests": 142,
    "total_credits_used": 3810,
    "by_modality": { "text": 98, "image": 44 },
    "by_provider": { "openai": 130, "fal": 12 }
  }
  ```
- `GET /api/v1/usage/daily` — returns per-day counts for charting:
  ```json
  { "days": [{ "date": "2026-04-10", "requests": 12, "credits": 340 }, ...] }
  ```
- Improve error response consistency: all errors return `{ "code": "...", "message": "..." }` — audit existing handlers

### Infra

- Enable FastAPI `/docs` in production (currently `docs_url="/docs"` — keep it)
- Add `redoc_url="/redoc"` as alternative

### Success Criteria

- [ ] Developer can see their usage broken down by provider/modality
- [ ] Model explorer shows all active models with real metadata
- [ ] `/docs` is publicly accessible and accurate
- [ ] Error messages are consistent and machine-readable

---

## Phase 6 — Infrastructure & Reliability

**Goal:** Production-ready deployment. No more "works on my machine." Handles failures gracefully.  
**Timeline:** 1 week

### Dockerization

**`docker-compose.yml` (local + staging):**
```yaml
services:
  db:
    image: postgres:15
    environment: { POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB }
    volumes: [pgdata:/var/lib/postgresql/data]

  backend:
    build: .
    env_file: .env
    depends_on: [db]
    ports: ["8000:8000"]
    volumes: [./outputs:/app/outputs]

  frontend:
    build: ./frontend
    env_file: ./frontend/.env.local
    ports: ["3000:3000"]
```

**`Dockerfile` (backend):**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Environment Configs

```
.env.dev      # local defaults
.env.staging  # staging DB, test keys
.env.prod     # production (never committed)
```

Add to `config.py`:
```python
ENV: str = "development"  # "staging" | "production"
```
Use `ENV` to toggle: debug logging, Swagger visibility, CORS origins.

### Storage: Local → S3/MinIO

Current: `outputs/{user_id}/{request_id}/result.{ext}` on local disk.

**Migration path (no breaking changes):**
1. Add `STORAGE_BACKEND: str = "local"` to config (`"s3"` | `"local"`)
2. Create `app/storage/base.py` (abstract: `save(path, data) → url`, `get_url(path) → str`)
3. `app/storage/local.py` — current logic extracted here
4. `app/storage/s3.py` — uses `boto3`, same interface
5. `generate.py` calls `storage.save()` instead of writing directly
6. Existing outputs are unaffected; new ones route to S3 when `STORAGE_BACKEND=s3`

**MinIO for local S3-compatible testing:**
```yaml
# add to docker-compose
minio:
  image: minio/minio
  command: server /data --console-address ":9001"
  ports: ["9000:9000", "9001:9001"]
```

### Rate Limiting

Add `slowapi` (FastAPI-native rate limiter):
```python
# per API key, not IP
limiter = Limiter(key_func=get_api_key_from_header)

@router.post("/generate")
@limiter.limit("60/minute")
def generate(...):
```

Default limits:
- `/generate`: 60 req/min
- All other endpoints: 120 req/min

### Retry / Fallback Logic

In `generate.py`, wrap provider call:
```python
for attempt in range(MAX_RETRIES):
    try:
        result = adapter.run(...)
        break
    except ProviderError as e:
        if attempt == MAX_RETRIES - 1:
            raise
        time.sleep(RETRY_BACKOFF[attempt])
```

Add `FALLBACK_PROVIDER` to RoutingConfig: if primary fails after retries, auto-route picks next-best model.

### Success Criteria

- [ ] `docker-compose up` starts entire stack from scratch
- [ ] `.env.prod` is the only secret — never in code
- [ ] S3 storage works when `STORAGE_BACKEND=s3`
- [ ] Rate limiting returns 429 with clear message
- [ ] Provider timeouts don't hang requests indefinitely

---

## Phase 7 — Scaling & Intelligence

**Goal:** System learns from real usage. Handles load. Response times improve.  
**Timeline:** 1–2 weeks

### Smart Routing Improvements

Current scoring is static weights. Upgrade to dynamic:

1. **Auto-latency feedback loop** — `scripts/update_latency.py` already exists. Wire it to run every 15 min via cron or APScheduler.
2. **Failure rate tracking** — add `failure_count_24h` column to `model_registry`. Increment on failed request. Penalize in scorer.
3. **Cost-aware routing per user** — pass user's credit balance into scorer. Low-balance users get routed to cheaper models.

### Caching

**Use Redis (via `redis-py`):**

- Cache `GET /api/v1/models` response for 60s (changes rarely)
- Cache `GET /api/v1/usage/summary` per user for 30s
- Optional: identical prompt+model → return cached output within 1h window (hash prompt+model as key)

```python
# config addition
REDIS_URL: str = "redis://localhost:6379"
CACHE_TTL_MODELS: int = 60
```

### Async Adapter Calls

Current adapters are sync (`httpx` sync). Migrate to async:
```python
# providers/base.py
async def run(self, prompt, params, api_key) -> AdapterResult: ...
```
FastAPI supports async endpoints natively. This removes the thread-pool overhead on I/O-heavy generation calls.

**Migration:** change `httpx.Client` → `httpx.AsyncClient`, `def run` → `async def run`, endpoint handlers add `async def`.

### Background Jobs

For long-running image generation, add async job queue:
1. `POST /generate` returns `{ request_id, status: "queued" }` immediately
2. Background worker processes job
3. `GET /generate/{request_id}/status` returns current status + output when ready

**Stack:** `arq` (Redis-based, async, minimal) or Celery if you need more.  
**Start with synchronous** — add this only when generation latency exceeds 10s regularly.

### Success Criteria

- [ ] Routing penalizes models with >10% failure rate in last 24h
- [ ] Model list endpoint returns cached response under load
- [ ] P95 generation latency improved vs Phase 3 baseline
- [ ] Async adapters pass all existing tests

---

## Phase 8 — Monetization & Access Control

**Goal:** Real revenue. Users buy credits. Access controlled by plan.  
**Timeline:** 1.5–2 weeks

### Stripe Integration

**Flow:**
1. User selects credit pack on `/settings` or `/billing` page
2. Frontend calls `POST /api/v1/billing/checkout` → backend creates Stripe Checkout Session → returns URL
3. User completes Stripe payment
4. Stripe webhook → `POST /api/v1/billing/webhook` → backend verifies signature → adds credits

**New endpoints:**
```
POST /api/v1/billing/checkout   { pack_id: "1000" | "5000" | "20000" } → { checkout_url }
POST /api/v1/billing/webhook    (Stripe sends this — verify Stripe-Signature header)
GET  /api/v1/billing/history    → list of credit purchases
```

**Credit packs (example):**
| Pack | Credits | Price |
|------|---------|-------|
| Starter | 1,000 | $5 |
| Pro | 5,000 | $20 |
| Scale | 20,000 | $70 |

**Schema addition:**
```python
class CreditPurchase(Base):
    id, user_id, stripe_session_id, credits_added, amount_usd, status, created_at
```

### Plans & Limits

Add `plan` column to `users`: `"free"` | `"pro"` | `"enterprise"`.

| Plan | Credits/month | Rate limit | Features |
|------|--------------|------------|---------|
| Free | 500 | 10 req/min | Manual only |
| Pro | 5,000 | 60 req/min | Manual + Auto |
| Enterprise | Unlimited | Custom | All + admin features |

Enforce in `deps.py` — `require_plan("pro")` dependency.

### Frontend

New page: `/billing`
- Current plan badge
- Credit balance + purchase buttons
- Purchase history table
- Stripe redirect on click

### Success Criteria

- [ ] User can purchase credits via Stripe Checkout
- [ ] Credits appear in balance immediately after webhook
- [ ] Free plan users get 429 on auto routing
- [ ] Stripe webhook handles duplicate events safely (idempotency)

---

## Frontend Architecture (Next.js)

```
frontend/
├── app/
│   ├── layout.tsx              # root layout, auth check
│   ├── page.tsx                # redirect → /generate
│   ├── login/page.tsx          # API key entry
│   ├── generate/page.tsx
│   ├── history/page.tsx
│   ├── dashboard/page.tsx
│   ├── models/page.tsx
│   ├── settings/page.tsx
│   └── billing/page.tsx
├── components/
│   ├── ui/                     # shadcn/ui base components
│   ├── GenerateForm.tsx
│   ├── OutputDisplay.tsx
│   ├── HistoryTable.tsx
│   ├── ModelTable.tsx
│   └── CreditBalance.tsx
├── lib/
│   ├── api.ts                  # typed fetch wrapper, injects X-API-Key header
│   └── auth.ts                 # API key storage (localStorage)
├── hooks/
│   ├── useGenerate.ts          # useMutation wrapper
│   ├── useHistory.ts
│   └── useModels.ts
└── types/
    └── api.ts                  # mirrors backend Pydantic schemas
```

**Auth pattern:** API key stored in `localStorage`, injected as `X-API-Key` header on every request via `lib/api.ts`. No cookies, no sessions.

**State management:** React Query for all server state. No Redux.

---

## Backend Enhancements Summary

| Enhancement | Phase | Priority |
|-------------|-------|---------|
| CORS middleware | 4 | Required |
| `GET /credits/balance` | 4 | Required |
| `GET /outputs/{id}` detail | 4 | Required |
| `GET /usage/summary` | 5 | High |
| `GET /usage/daily` | 5 | High |
| Consistent error format audit | 5 | Medium |
| Rate limiting (slowapi) | 6 | High |
| Retry + fallback in generate.py | 6 | High |
| Async adapters | 7 | Medium |
| Redis cache | 7 | Medium |
| Stripe billing endpoints | 8 | Required |
| Plan enforcement in deps.py | 8 | Required |

---

## Infrastructure Plan

### Local Dev (Now)
```
uvicorn app.main:app --reload    # backend on :8000
npm run dev                      # frontend on :3000 (Phase 4+)
postgres running locally         # existing setup
```

### Dockerized (Phase 6)
```
docker-compose up                # spins backend + frontend + postgres + minio
```

### VPS Deployment (Phase 6+)
- **Provider:** Hetzner CX21 (~$6/mo) or DigitalOcean Droplet
- **Stack:** Docker Compose on single VPS
- **Reverse proxy:** Caddy (automatic HTTPS)
- **Process:** push to main → SSH deploy script pulls + restarts containers

```
# Caddy config
api.syphakie.com {
    reverse_proxy backend:8000
}
app.syphakie.com {
    reverse_proxy frontend:3000
}
```

### Cloud (Optional, Phase 7+)
- Backend → Railway or Render (auto-deploy from GitHub)
- DB → Supabase or Railway Postgres
- Storage → AWS S3 or Cloudflare R2
- Only move here when VPS becomes a bottleneck

---

## Data & Storage Evolution

| Phase | Storage | Notes |
|-------|---------|-------|
| 1–3 (now) | Local disk | `outputs/` dir, served via StaticFiles |
| 6 | S3/MinIO | `STORAGE_BACKEND=s3` toggle, backward-compatible |
| 7+ | S3 + CDN | CloudFront or Cloudflare in front of S3 |

**Cleanup strategy:**
- Add `expires_at` column to `request_records`
- Cron job: delete outputs older than 30 days for free users, 1 year for pro
- Script: `scripts/cleanup_outputs.py` — matches disk cleanup to DB records

**Request history scaling:**
- Index `request_records` on `(user_id, created_at)` — already implied by query pattern
- Add explicit: `CREATE INDEX idx_rr_user_created ON request_records(user_id, created_at DESC);`
- At 1M rows: add DB partitioning by month (Postgres native, no ORM change)

---

## Developer Experience

### API Docs
- Swagger at `/docs` — already enabled
- Add `description=` to every router and endpoint for clean Swagger UI
- Add request/response examples via Pydantic `model_config = {"json_schema_extra": {...}}`

### Postman Collection
File: `docs/syphakie.postman_collection.json`  
Covers: auth, generate (text + image), credits, outputs, usage, admin  
Variables: `{{base_url}}`, `{{api_key}}`  
Export from current working curl tests.

### SDK (Phase 5+, optional)
Start with a thin Python wrapper:
```python
# pip install syphakie
client = SyphaKie(api_key="sk-...")
result = client.generate(modality="text", prompt="Hello", model="gpt-4o")
print(result.output.content)
```
Single file, `requests`-based, published to PyPI. Only if API usage picks up.

---

## Execution Timeline

| Phase | Focus | Duration | Cumulative |
|-------|-------|----------|-----------|
| 4 | Next.js UI foundation | 1.5 weeks | Week 2 |
| 5 | Developer dashboard + usage APIs | 1 week | Week 3 |
| 6 | Docker + S3 + rate limiting + retry | 1 week | Week 4 |
| 7 | Caching + async + smart routing | 1.5 weeks | Week 5.5 |
| 8 | Stripe + plans + billing UI | 1.5 weeks | Week 7 |

**Total: ~7 weeks solo to full monetized product.**

---

## START HERE

These are your next 5 concrete actions after reading this plan:

### 1. Add CORS + two missing endpoints (30 min)
```python
# app/main.py — add CORSMiddleware
# app/api/credits.py — add GET /credits/balance
# app/api/outputs.py — add GET /outputs/{request_id} detail
```

### 2. Initialize Next.js project (20 min)
```bash
cd frontend
npx create-next-app@latest . --typescript --tailwind --app
npx shadcn@latest init
```

### 3. Build `lib/api.ts` — the API client (1 hour)
Typed wrapper around fetch. Every hook and page uses this. Get auth right here and everything else follows.

### 4. Build `/generate` page (half day)
This is the core value. Ship it working before any other page. Text first, image second.

### 5. Run `docker-compose up` with a basic Dockerfile (1 hour)
Do this early so you never have "works on my machine" issues. Lock the environment before adding complexity.

---

*Last updated: 2026-04-17 | Backend: Phases 1–3 complete | Next: Phase 4*
