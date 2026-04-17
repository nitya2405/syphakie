import math
from sqlalchemy.orm import Session
from app.models.credit import Credit
from app.routing.engine import SelectedModel
from app.core.exceptions import InsufficientCreditsError


class CreditService:
    def __init__(self, db: Session):
        self.db = db

    def get_balance(self, user_id) -> int:
        credit = self.db.query(Credit).filter_by(user_id=user_id).first()
        return credit.balance if credit else 0

    def estimate(self, modality: str, model: SelectedModel, params: dict) -> int:
        if modality == "image":
            return int(model.cost_per_unit)

        # text: estimate based on max_tokens + assumed prompt size
        max_tokens = params.get("max_tokens", 1000)
        estimated_tokens = 200 + max_tokens
        return max(1, math.ceil(estimated_tokens * model.cost_per_unit))

    def prededuct(self, user_id, amount: int) -> None:
        credit = self.db.query(Credit).filter_by(user_id=user_id).with_for_update().first()
        if not credit or credit.balance < amount:
            raise InsufficientCreditsError(balance=credit.balance if credit else 0, required=amount)
        credit.balance -= amount
        self.db.commit()

    def refund(self, user_id, amount: int) -> None:
        credit = self.db.query(Credit).filter_by(user_id=user_id).first()
        if credit:
            credit.balance += amount
            self.db.commit()

    def adjust_to_actual(self, user_id, estimated: int, units_used: float, cost_per_unit: float) -> int:
        actual = max(1, math.ceil(units_used * cost_per_unit))
        diff = estimated - actual  # positive = we overcharged, refund the diff
        if diff != 0:
            credit = self.db.query(Credit).filter_by(user_id=user_id).first()
            if credit:
                credit.balance += diff
                self.db.commit()
        return actual
