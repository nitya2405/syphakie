import math
from sqlalchemy.orm import Session
from app.models.credit import Credit
from app.models.organization import Organization
from app.routing.engine import SelectedModel
from app.core.exceptions import InsufficientCreditsError


class CreditService:
    def __init__(self, db: Session):
        self.db = db

    def get_balance(self, user_id) -> int:
        credit = self.db.query(Credit).filter_by(user_id=user_id).first()
        return credit.balance if credit else 0

    def estimate(self, model: SelectedModel, params: dict) -> int:
        ut = model.unit_type

        if ut == "token":
            max_tokens = params.get("max_tokens", 1000)
            return max(1, math.ceil((200 + max_tokens) * model.cost_per_unit))

        if ut == "image":
            n = params.get("n", 1)
            return max(1, math.ceil(n * model.cost_per_unit))

        if ut == "generation":
            # Flat fee: video clips, music gen, audio-gen, lip-sync, etc.
            return max(1, int(model.cost_per_unit))

        if ut == "character":
            # TTS: cost per 1 000 characters; fall back to 500-char estimate
            text = params.get("text") or params.get("input", "")
            chars = len(text) if text else 500
            return max(1, math.ceil((chars / 1000) * model.cost_per_unit))

        if ut == "minute":
            # STT (Whisper): cost per minute of audio
            seconds = params.get("duration_seconds", 60)
            return max(1, math.ceil((seconds / 60) * model.cost_per_unit))

        if ut == "second":
            # Variable-length video/audio billed per second
            seconds = params.get("duration_seconds", 5)
            return max(1, math.ceil(seconds * model.cost_per_unit))

        # Unknown unit type — treat cost_per_unit as flat fee
        return max(1, int(model.cost_per_unit))

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

    # ── Org credit methods ──────────────────────────────────────────────────

    def get_org_balance(self, org_id) -> int:
        org = self.db.query(Organization).filter_by(id=org_id).first()
        return org.credits_balance if org else 0

    def prededuct_org(self, org_id, amount: int) -> None:
        org = self.db.query(Organization).filter_by(id=org_id).with_for_update().first()
        if not org or org.credits_balance < amount:
            raise InsufficientCreditsError(balance=org.credits_balance if org else 0, required=amount)
        org.credits_balance -= amount
        self.db.commit()

    def refund_org(self, org_id, amount: int) -> None:
        org = self.db.query(Organization).filter_by(id=org_id).first()
        if org:
            org.credits_balance += amount
            self.db.commit()

    def adjust_to_actual_org(self, org_id, estimated: int, units_used: float, cost_per_unit: float) -> int:
        actual = max(1, math.ceil(units_used * cost_per_unit))
        diff = estimated - actual
        if diff != 0:
            org = self.db.query(Organization).filter_by(id=org_id).first()
            if org:
                org.credits_balance += diff
                self.db.commit()
        return actual
