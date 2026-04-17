"""
Tests the routing engine against the live model_registry table.
Usage: python scripts/test_routing.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db.session import SessionLocal
from app.routing.engine import RoutingEngine


def test(label, modality, model_id, provider=None):
    db = SessionLocal()
    engine = RoutingEngine(db)
    try:
        result = engine.select(modality=modality, mode="manual", model_id=model_id, provider=provider)
        print(f"[PASS] {label}")
        print(f"       → {result.provider} / {result.model_id} | {result.cost_per_unit} credits/{result.unit_type}")
    except Exception as e:
        print(f"[FAIL] {label}")
        print(f"       → {e}")
    finally:
        db.close()


if __name__ == "__main__":
    test("text: gpt-4o",        modality="text",  model_id="gpt-4o")
    test("text: gpt-3.5-turbo", modality="text",  model_id="gpt-3.5-turbo")
    test("image: dall-e-3",     modality="image", model_id="dall-e-3")
    test("image: dall-e-2",     modality="image", model_id="dall-e-2")
    test("wrong modality",      modality="video", model_id="gpt-4o")
    test("nonexistent model",   modality="text",  model_id="fake-model-99")
    test("no model given",      modality="text",  model_id=None)
