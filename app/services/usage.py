from sqlalchemy.orm import Session
from app.models.usage_log import UsageLog


class UsageService:
    def __init__(self, db: Session):
        self.db = db

    def log(
        self,
        request_id: str,
        user_id,
        provider: str,
        model_id: str,
        units_used: float,
        unit_type: str,
        cost_per_unit: float,
        credits_charged: int,
    ) -> None:
        entry = UsageLog(
            request_id=request_id,
            user_id=user_id,
            provider=provider,
            model_id=model_id,
            units_used=units_used,
            unit_type=unit_type,
            cost_per_unit=cost_per_unit,
            credits_charged=credits_charged,
        )
        self.db.add(entry)
        self.db.commit()
