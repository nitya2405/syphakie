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
- `GET /credits` — balance already exists
- `GET /outputs/{request_id}` — single output detail already exists

---

## Phase 4A — Core UI (Ship Fast)

**Goal:** Get something in a browser. Only the two screens that prove the product works.  
**Timeline:** 1–2 days (hard cap — if it takes longer, scope is wrong)

### What to build

**Only two pages:**

| Route | What |
|-------|------|
| `/login` | API key entry, stored to localStorage |
| `/generate` | The entire product in one screen |

**`/generate` must have:**
- Modality selector (Text / Image)
- Mode selector (Manual / Auto)
- Model dropdown (from `GET /api/v1/models`)
- Prompt textarea
- Submit button → loading state → output rendered inline
- Credit balance shown after response (from `meta.credits_remaining`)
- Error display if generation fails

**`/settings` (minimal):**
- Show API key (masked, copy button)
- Current credit balance from `GET /api/v1/credits`
- Nothing else

### Backend Changes

- Add CORS middleware — required before any browser request works:
  ```python
  from fastapi.middleware.cors import CORSMiddleware
  app.add_middleware(
      CORSMiddleware,
      allow_origins=["http://localhost:3000"],
      allow_methods=["*"],
      allow_headers=["*"],
  )
  ```
- `GET /credits` already returns `{ balance }` — no new endpoint needed
- `GET /outputs/{request_id}` already exists — no new endpoint needed

### Stack

Next.js 14 (App Router), Tailwind CSS, shadcn/ui, React Query

```bash
npx create-next-app@latest frontend --typescript --tailwind --app
cd frontend && npx shadcn@latest init
```

### Success Criteria

- [ ] User can generate text from browser with real API key
- [ ] User can generate image from browser
- [ ] Credit balance updates after each generation
- [ ] Empty state + error state both handled without breaking UI
- [ ] Ships in ≤2 days

---

## Phase 4B — UX Completion

**Goal:** Make the product feel complete for regular users.  
**Timeline:** 3–4 days  
**Start only after Phase 4A is working and you've used it yourself.**

### New Pages

| Route | Purpose |
|-------|---------|
| `/history` | Past requests with outputs |
| `/settings` (full) | Provider key management (Fal, Stability) added |

**`/history` page:**
- Table from `GET /api/v1/usage` — request list with modality, model, credits, timestamp
- Click row → expand to show output (text inline, image rendered)
- Filter by modality (client-side filter is fine at this scale)
- Empty state for new users

**`/settings` additions:**
- Provider key management (Fal, Stability) via `POST /api/v1/auth/provider-keys`
- List stored provider keys via `GET /api/v1/auth/provider-keys`

### Success Criteria

- [ ] History shows last 20 requests with output on click
- [ ] Provider keys can be added and listed
- [ ] No console errors, no broken states on empty history
- [ ] Navigation between all pages works

---

## Phase 5 — Developer Platform

**Goal:** Make the API a first-class product. Prioritize discoverability and usability over charts.  
**Timeline:** 1 week  
**Rule:** No analytics charts until there is real user data to make them meaningful.**

### What to build first: Model Explorer + API usability

**`/models` page (priority #1):**
- Table: model_id, provider, modality, cost/unit, latency, quality score, active status
- Filter by modality (Text / Image)
- "Try it" button → redirects to `/generate` with model pre-selected
- Data from `GET /api/v1/models`

**API usability improvements:**
- Add `description=` and response examples to every FastAPI router and endpoint
- This makes `/docs` (Swagger) genuinely useful — developers can test from browser
- Add `redoc_url="/redoc"` as an alternative docs format

**`/dashboard` page (deferred until real usage exists):**
- Build this only once you have actual user traffic to display
- Placeholder: show credit balance, total request count, last 5 requests
- Full charts (daily volume, provider breakdown) come only when they would show meaningful data

### New Backend Endpoints

`GET /api/v1/usage/summary` — for the placeholder dashboard:
```json
{
  "total_requests": 142,
  "total_credits_used": 3810,
  "by_modality": { "text": 98, "image": 44 },
  "by_provider": { "openai": 130, "fal": 12 }
}
```

`GET /api/v1/usage/daily` — when charts become worth building:
```json
{ "days": [{ "date": "2026-04-10", "requests": 12, "credits": 340 }, ...] }
```

Error response audit: verify all errors return `{ "code": "...", "message": "..." }` — this is already true for most endpoints, just verify edge cases.

### Success Criteria

- [ ] `/models` page lists all active models with metadata
- [ ] "Try it" pre-fills `/generate` correctly
- [ ] `/docs` is accurate and usable by a developer who has never seen the code
- [ ] `GET /usage/summary` returns real aggregated data

---

## Validation Milestone — Before Any Infrastructure Work

**This checkpoint must happen before Phase 6.**

**Goal:** Confirm real users find the product useful before investing in infra.

**What to do:**
- Give access to 3+ real users (developers, creators, or colleagues)
- Watch them use `/generate` and browse `/models`
- Note: what breaks, what confuses them, what they try to do that doesn't work
- Check: are they actually generating things, or dropping off at login?

**What this tells you before Phase 6:**
- Whether the credit UX is clear enough (do they know why requests fail?)
- Whether manual vs auto routing distinction makes sense to users
- Whether any provider (OpenAI, Fal) produces errors you haven't seen yet
- Whether `/history` is actually used or ignored

**Don't skip this.** If no one uses the UI after Phase 4A + 4B, scaling infra is premature. Fix the product first.

**Success criteria:**
- [ ] ≥3 users have successfully generated at least one output
- [ ] You have a list of observed friction points to address
- [ ] At least one issue found that wasn't visible in solo testing

---

## Phase 6A — Docker + Deployment

**Goal:** Reproducible environment. Backend running on a real server, accessible via domain.  
**Timeline:** 2–3 days

### Dockerization

**`Dockerfile` (backend):**
```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**`docker-compose.yml`:**
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

### VPS Deployment

- **Provider:** Hetzner CX21 (~$6/mo) or DigitalOcean Droplet
- **Reverse proxy:** Caddy (automatic HTTPS, one config file)

```
# Caddyfile
api.syphakie.com { reverse_proxy backend:8000 }
app.syphakie.com { reverse_proxy frontend:3000 }
```

- **Deploy process:** push to main → SSH in → `docker-compose pull && docker-compose up -d`

### Success Criteria

- [ ] `docker-compose up` starts entire stack from scratch on a fresh machine
- [ ] Backend reachable at `api.syphakie.com` with HTTPS
- [ ] Frontend reachable at `app.syphakie.com`
- [ ] `.env.prod` is the only secret location — never in code or image

---

## Phase 6B — Reliability

**Goal:** Graceful failure. No hanging requests, no cascade failures, no silent drops.  
**Timeline:** 2–3 days

### Rate Limiting

Add `slowapi`:
```python
limiter = Limiter(key_func=get_api_key_from_header)

@router.post("/generate")
@limiter.limit("60/minute")
def generate(...): ...
```

Limits:
- `/generate`: 60 req/min per API key
- All other endpoints: 120 req/min
- Returns 429 with `{ "code": "RATE_LIMITED", "message": "..." }`

### Retry + Fallback

In `generate.py`, wrap provider call:
```python
for attempt in range(MAX_RETRIES):  # MAX_RETRIES = 2
    try:
        result = adapter.run(...)
        break
    except ProviderError:
        if attempt == MAX_RETRIES - 1:
            raise
        time.sleep(RETRY_BACKOFF[attempt])  # [1, 3]
```

Add `FALLBACK_ON_FAILURE: bool = True` to RoutingConfig. On final failure in auto mode, re-run `_auto()` excluding the failed provider.

### Timeouts

Set explicit timeouts on all provider HTTP calls:
```python
httpx.Client(timeout=30.0)  # never hang indefinitely
```

### Success Criteria

- [ ] Rate limiting returns 429 with clear message
- [ ] Provider timeout does not hang request past 35s
- [ ] Failed provider in auto mode triggers fallback to next-best model
- [ ] All existing tests still pass

---

## Phase 6C — Storage Migration

**Goal:** Outputs survive server restarts and scale beyond one machine.  
**Timeline:** 2–3 days  
**Start only when local disk storage becomes a real problem or before cloud deploy.**

### Migration Path (no breaking changes)

1. Add `STORAGE_BACKEND: str = "local"` to config (`"s3"` | `"local"`)
2. Create `app/storage/base.py` — abstract interface: `save(path, data) → url`
3. `app/storage/local.py` — extract current logic here (no behavior change)
4. `app/storage/s3.py` — same interface, uses `boto3`
5. `generate.py` calls `storage.save()` instead of writing files directly
6. Existing outputs on disk remain accessible via StaticFiles as before

### MinIO for Local S3 Testing

```yaml
# add to docker-compose
minio:
  image: minio/minio
  command: server /data --console-address ":9001"
  ports: ["9000:9000", "9001:9001"]
```

### Success Criteria

- [ ] `STORAGE_BACKEND=local` behaves identically to current behavior
- [ ] `STORAGE_BACKEND=s3` saves to S3 and returns accessible URL
- [ ] Existing outputs are unaffected by the switch
- [ ] MinIO works as a drop-in for S3 in local dev

---

## Phase 7A — Caching (Redis)

**Goal:** Reduce DB load on hot read paths.  
**Timeline:** 2 days

Cache these endpoints with Redis:
- `GET /api/v1/models` — 60s TTL (model list changes only on admin action)
- `GET /api/v1/usage/summary` — 30s TTL per user
- Optional: identical prompt+model hash → return cached output within 1h

```python
# config addition
REDIS_URL: str = "redis://localhost:6379"
CACHE_TTL_MODELS: int = 60
```

Add Redis to docker-compose. Use `redis-py` with a thin decorator or manual cache-aside pattern — no framework needed.

### Success Criteria

- [ ] `/models` endpoint returns cached response on repeated calls
- [ ] Cache invalidates when admin changes model status
- [ ] Redis down → endpoint still works (catch connection error, fall through to DB)

---

## Phase 7B — Async Adapters

**Goal:** Remove thread-pool overhead. Generation calls are pure I/O — they should be async.  
**Timeline:** 2–3 days

Migrate providers from sync `httpx.Client` to async `httpx.AsyncClient`:

```python
# providers/base.py
async def run(self, prompt, params, api_key) -> AdapterResult: ...
```

Change endpoint handlers to `async def`. FastAPI handles this natively.

**Migration is mechanical:** find all `httpx.Client(...)` calls, replace with `async with httpx.AsyncClient(...) as client:`, add `await` to `.post()` / `.get()` calls.

### Success Criteria

- [ ] All existing adapter tests pass with async versions
- [ ] No sync `httpx.Client` calls remain in providers
- [ ] Generation endpoints are `async def`

---

## Phase 7C — Smart Routing Improvements

**Goal:** Routing reflects real-world performance, not seed data.  
**Timeline:** 2–3 days  
**Build after 7A and 7B — needs real latency/failure data to be meaningful.**

1. **Auto-latency feedback loop** — `scripts/update_latency.py` already exists. Wire it to APScheduler running every 15 min inside the backend process.

2. **Failure rate tracking** — add `failure_count_24h` column to `model_registry`. Increment on failed request. Add penalty term in `scorer.py`: a model with >10% failure rate in 24h gets a 0.3 score penalty.

3. **Cost-aware routing per user** — pass user's credit balance into `_auto()`. If balance < 100, filter to cheapest models only.

### Success Criteria

- [ ] Latency averages update automatically without manual script runs
- [ ] A model with repeated failures is deprioritized in auto routing
- [ ] Low-credit users are not routed to expensive models

---

## Phase 8 — Monetization & Access Control

**Goal:** Real revenue. Credit purchases, plan tiers, abuse prevention.  
**Timeline:** 1.5–2 weeks

### Stripe Integration

**Flow:**
1. User selects credit pack on `/billing` page
2. Frontend calls `POST /api/v1/billing/checkout` → backend creates Stripe Checkout Session → returns URL
3. User completes Stripe payment
4. Stripe webhook → `POST /api/v1/billing/webhook` → verify signature → add credits

**New endpoints:**
```
POST /api/v1/billing/checkout   { pack_id } → { checkout_url }
POST /api/v1/billing/webhook    Stripe sends this — verify Stripe-Signature header
GET  /api/v1/billing/history    → list of credit purchases
```

**Credit packs:**
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

| Plan | Credits/month | Rate limit | Daily cap | Features |
|------|--------------|------------|-----------|---------|
| Free | 500 | 10 req/min | 50 req/day | Manual only |
| Pro | 5,000 | 60 req/min | None | Manual + Auto |
| Enterprise | Unlimited | Custom | None | All + admin |

### Abuse Protection

Enforce alongside plan limits — not as a separate feature:

- **Free-tier rate limit:** 10 req/min, enforced in `slowapi` via plan check in key function
- **Daily credit cap:** free users cannot exceed 50 credits/day — check in `credits.py` before `prededuct()`
- **Hard generation block:** if `credits_used_today >= DAILY_CAP`, return 429 with `DAILY_LIMIT_REACHED` before routing
- **Idempotency on Stripe webhook:** store `stripe_session_id`, reject duplicate webhook events

Enforce plan in `deps.py`:
```python
def require_plan(min_plan: str):
    # free < pro < enterprise
    ...
```

### Frontend

New page: `/billing`
- Current plan badge
- Credit balance + purchase buttons
- Purchase history table
- Stripe redirect on click

### Success Criteria

- [ ] User can purchase credits via Stripe Checkout
- [ ] Credits appear immediately after webhook
- [ ] Free plan users hit daily cap and get clear error
- [ ] Free plan users cannot use auto routing
- [ ] Stripe webhook is idempotent (duplicate events don't double-add credits)

---

## Frontend Architecture (Next.js)

```
frontend/
├── app/
│   ├── layout.tsx              # root layout, auth check
│   ├── page.tsx                # redirect → /generate
│   ├── login/page.tsx
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
│   ├── useGenerate.ts
│   ├── useHistory.ts
│   └── useModels.ts
└── types/
    └── api.ts                  # mirrors backend Pydantic schemas
```

**Auth:** API key in `localStorage`, injected as `X-API-Key` on every request via `lib/api.ts`.  
**State:** React Query for all server state. No Redux.

---

## Backend Enhancements Summary

| Enhancement | Phase | Priority | Status |
|-------------|-------|---------|--------|
| CORS middleware | 4A | Required | To build |
| `GET /credits` balance | — | — | Already exists |
| `GET /outputs/{id}` detail | — | — | Already exists |
| `GET /usage/summary` | 5 | High | To build |
| `GET /usage/daily` | 5 | Medium | To build |
| Error format audit | 5 | Medium | To build |
| Rate limiting (slowapi) | 6B | High | To build |
| Retry + fallback | 6B | High | To build |
| Storage abstraction | 6C | Medium | To build |
| Redis cache | 7A | Medium | To build |
| Async adapters | 7B | Medium | To build |
| Latency APScheduler | 7C | Medium | To build |
| Stripe billing | 8 | Required | To build |
| Plan + abuse enforcement | 8 | Required | To build |

---

## Infrastructure Plan

### Local Dev (Now)
```
uvicorn app.main:app --reload    # backend :8000
npm run dev                      # frontend :3000 (Phase 4A+)
postgres running locally
```

### Dockerized (Phase 6A)
```
docker-compose up    # backend + frontend + postgres
```

### VPS (Phase 6A)
Hetzner CX21 or DigitalOcean, Docker Compose, Caddy reverse proxy.

### Cloud (Optional, Phase 7+)
Railway / Render for backend, Supabase for DB, Cloudflare R2 for storage. Only if VPS becomes a bottleneck.

---

## Data & Storage Evolution

| Phase | Storage | Notes |
|-------|---------|-------|
| 1–3 (now) | Local disk | `outputs/` dir, StaticFiles |
| 6C | S3/MinIO | `STORAGE_BACKEND=s3` toggle |
| 7+ | S3 + CDN | Cloudflare in front of S3 |

**Cleanup strategy:**
- Add `expires_at` to `request_records`
- Script: `scripts/cleanup_outputs.py` — delete disk files matching expired DB records
- Free users: 30-day retention. Pro: 1-year.

**Scaling request history:**
- Add index: `CREATE INDEX idx_rr_user_created ON request_records(user_id, created_at DESC);`
- At 1M rows: Postgres partitioning by month — no ORM change required

---

## Developer Experience

### API Docs
- Swagger at `/docs` — already enabled
- Add `description=` to every router for clean Swagger UI
- Add `redoc_url="/redoc"` as alternative format

### Postman Collection
`docs/syphakie.postman_collection.json`  
Variables: `{{base_url}}`, `{{api_key}}`  
Covers all endpoints. Export from existing curl tests.

### SDK (Optional, Phase 5+)
Only build if external developer usage picks up:
```python
client = SyphaKie(api_key="sk-...")
result = client.generate(modality="text", prompt="Hello", model="gpt-4o")
```
Single file, `requests`-based, PyPI.

---

## Execution Timeline

| Phase | Focus | Duration | Cumulative |
|-------|-------|----------|-----------|
| 4A | /generate + /login (core UI) | 1–2 days | Day 2 |
| 4B | /history + full /settings | 3–4 days | Day 6 |
| **Validation** | **3 real users, observe usage** | **ongoing** | **before Phase 6** |
| 5 | /models + API usability | 1 week | Week 2.5 |
| 6A | Docker + VPS deploy | 2–3 days | Week 3 |
| 6B | Rate limiting + retry + fallback | 2–3 days | Week 3.5 |
| 6C | Storage abstraction + S3 | 2–3 days | Week 4 |
| 7A | Redis caching | 2 days | Week 4.5 |
| 7B | Async adapters | 2–3 days | Week 5 |
| 7C | Smart routing improvements | 2–3 days | Week 5.5 |
| 8 | Stripe + plans + abuse protection | 1.5–2 weeks | Week 7.5 |

**Total: ~7.5 weeks solo to full monetized product.**

---

## START HERE

### 1. Add CORS middleware (15 min)
In `app/main.py`, add `CORSMiddleware` allowing `http://localhost:3000`. This unblocks all frontend work.

### 2. Initialize Next.js project (20 min)
```bash
npx create-next-app@latest frontend --typescript --tailwind --app
cd frontend && npx shadcn@latest init
```

### 3. Build `lib/api.ts` (1 hour)
Typed fetch wrapper that reads API key from localStorage and injects `X-API-Key` header. Every hook depends on this — get it right first.

### 4. Build `/generate` page (half day)
Text generation first, image second. Ship Phase 4A complete before moving to /history or /settings.

### 5. Use it yourself before Phase 4B (1 day of dogfooding)
Generate 20 things. Notice what's annoying. Fix the worst two issues. Then build /history.

---

*Last updated: 2026-04-17 | Backend: Phases 1–3 complete | Next: Phase 4A*
