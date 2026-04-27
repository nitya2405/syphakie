import time
from collections import defaultdict, deque
from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware

# Sliding window: max requests per window_seconds per key
RATE_LIMIT = 60          # requests
WINDOW_SECONDS = 60      # per minute


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, rate: int = RATE_LIMIT, window: int = WINDOW_SECONDS):
        super().__init__(app)
        self.rate = rate
        self.window = window
        self._buckets: dict[str, deque] = defaultdict(deque)

    async def dispatch(self, request: Request, call_next):
        key = request.headers.get("X-API-Key")
        if not key:
            return await call_next(request)

        now = time.monotonic()
        bucket = self._buckets[key]

        while bucket and now - bucket[0] > self.window:
            bucket.popleft()

        # Prune idle keys: all timestamps expired means the key was inactive; delete
        # and re-fetch so the new timestamp lands in a fresh tracked entry.
        if not bucket:
            del self._buckets[key]
            bucket = self._buckets[key]

        if len(bucket) >= self.rate:
            raise HTTPException(
                status_code=429,
                detail={"code": "RATE_LIMIT_EXCEEDED", "message": f"Too many requests. Limit: {self.rate} per {self.window}s."},
            )

        bucket.append(now)
        return await call_next(request)
