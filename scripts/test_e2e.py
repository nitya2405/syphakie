"""
Phase 1 end-to-end test.
Runs the full flow: generate text + image, check credits, retrieve outputs.
Usage: python scripts/test_e2e.py
"""
import sys
import os
import json
import urllib.request
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BASE_URL = "http://localhost:8000/api/v1"
API_KEY  = "sk-11FKGQR2Zn3uml-Al781CxseRRYXXVjPm-kl5zabIYk"
HEADERS  = {"X-API-Key": API_KEY, "Content-Type": "application/json"}


def request(method, path, body=None):
    url = BASE_URL + path
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"error": e.code, "body": e.read().decode()}


def check(label, condition, info=""):
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {label}" + (f" — {info}" if info else ""))
    return condition


print("\n=== SyphaKie Phase 1 — End-to-End Test ===\n")

# 1. Check starting balance
print("1. Starting balance")
r = request("GET", "/credits")
balance_start = r.get("balance", 0)
check("balance is 1000 or less", balance_start <= 1000, f"balance={balance_start}")

# 2. Generate text
print("\n2. Generate text (gpt-3.5-turbo)")
r = request("POST", "/generate", {
    "modality": "text",
    "mode": "manual",
    "model": "gpt-3.5-turbo",
    "prompt": "What is 2 + 2? Answer in one word.",
    "params": {"max_tokens": 10},
})
text_ok = check("success=true", r.get("success") is True)
text_ok = check("content is a string", isinstance(r.get("output", {}).get("content"), str)) and text_ok
text_ok = check("url is returned", r.get("output", {}).get("url") is not None) and text_ok
text_ok = check("credits_used > 0", r.get("meta", {}).get("credits_used", 0) > 0,
                f"credits_used={r.get('meta', {}).get('credits_used')}") and text_ok
text_request_id = r.get("request_id")
credits_after_text = r.get("meta", {}).get("credits_remaining", balance_start)
print(f"       content: {r.get('output', {}).get('content', '').strip()}")
print(f"       request_id: {text_request_id}")

# 3. Generate image
print("\n3. Generate image (dall-e-2)")
r = request("POST", "/generate", {
    "modality": "image",
    "mode": "manual",
    "model": "dall-e-2",
    "prompt": "A blue circle on white background",
    "params": {"size": "256x256"},
})
img_ok = check("success=true", r.get("success") is True)
img_ok = check("url is returned", r.get("output", {}).get("url") is not None) and img_ok
img_ok = check("content is null", r.get("output", {}).get("content") is None) and img_ok
img_ok = check("credits_used = 15", r.get("meta", {}).get("credits_used") == 15,
               f"credits_used={r.get('meta', {}).get('credits_used')}") and img_ok
img_request_id = r.get("request_id")
credits_after_image = r.get("meta", {}).get("credits_remaining")
print(f"       request_id: {img_request_id}")

# 4. Check credit balance dropped
print("\n4. Credit balance after generation")
r = request("GET", "/credits")
balance_now = r.get("balance", 0)
check("balance decreased", balance_now < balance_start,
      f"{balance_start} → {balance_now}")
check("balance matches response", balance_now == credits_after_image,
      f"DB={balance_now}, response={credits_after_image}")

# 5. Retrieve text output
print("\n5. Retrieve text output")
r = request("GET", f"/outputs/{text_request_id}")
check("request_id matches", r.get("request_id") == text_request_id)
check("modality=text", r.get("modality") == "text")
check("url present", r.get("output", {}).get("url") is not None)

# 6. Retrieve image output
print("\n6. Retrieve image output")
r = request("GET", f"/outputs/{img_request_id}")
check("request_id matches", r.get("request_id") == img_request_id)
check("modality=image", r.get("modality") == "image")
check("url present", r.get("output", {}).get("url") is not None)

# 7. Models list
print("\n7. Models list")
r = request("GET", "/models/list")
models = r.get("models", [])
check("4 models returned", len(models) == 4, f"got {len(models)}")
check("has gpt-4o", any(m["model_id"] == "gpt-4o" for m in models))
check("has dall-e-3", any(m["model_id"] == "dall-e-3" for m in models))

# 8. Invalid key rejected
print("\n8. Auth — invalid key rejected")
old_key = HEADERS["X-API-Key"]
HEADERS["X-API-Key"] = "sk-invalidkey"
r = request("GET", "/credits")
check("returns error", "error" in r, f"got: {r}")
HEADERS["X-API-Key"] = old_key

# 9. Wrong model rejected
print("\n9. Routing — unknown model rejected")
r = request("POST", "/generate", {
    "modality": "text",
    "mode": "manual",
    "model": "gpt-999-fake",
    "prompt": "test",
})
check("returns error", "error" in r, f"got: {r}")

print(f"\n=== Done. Final balance: {balance_now} credits ===\n")
