"""
Computes rolling average latency per model from request_records and updates model_registry.
Run periodically (e.g., cron) or manually after traffic accumulates.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.config import settings
from app.models.model_registry import ModelRegistry
from app.models.request_record import RequestRecord

ROLLING_WINDOW = 100  # use last N successful requests per model

engine = create_engine(settings.DATABASE_URL)
Session = sessionmaker(bind=engine)


def update_latencies():
    with Session() as db:
        rows = db.execute(
            text("""
                SELECT model_id, AVG(latency_ms)::int AS avg_ms, COUNT(*) AS n
                FROM (
                    SELECT model_id, latency_ms,
                           ROW_NUMBER() OVER (PARTITION BY model_id ORDER BY created_at DESC) AS rn
                    FROM request_records
                    WHERE status = 'success' AND latency_ms IS NOT NULL
                ) sub
                WHERE rn <= :window
                GROUP BY model_id
            """),
            {"window": ROLLING_WINDOW},
        ).fetchall()

        if not rows:
            print("No successful request data found — nothing to update.")
            return

        updated = 0
        for row in rows:
            model = db.query(ModelRegistry).filter_by(model_id=row.model_id).first()
            if model:
                old = model.avg_latency_ms
                model.avg_latency_ms = row.avg_ms
                print(f"  {row.model_id}: {old}ms → {row.avg_ms}ms  (n={row.n})")
                updated += 1
            else:
                print(f"  SKIP {row.model_id}: not in model_registry")

        db.commit()
        print(f"\nUpdated {updated} model(s).")


if __name__ == "__main__":
    print(f"Updating latency averages (window={ROLLING_WINDOW})...")
    update_latencies()
