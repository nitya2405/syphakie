from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, require_admin, get_db
from app.models.user import User
from app.models.credit import Credit
from pydantic import BaseModel

router = APIRouter()


@router.get("/credits")
def get_credits(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    credit = db.query(Credit).filter_by(user_id=current_user.id).first()
    return {"balance": credit.balance if credit else 0}


class AdjustRequest(BaseModel):
    user_id: str
    amount: int
    reason: str = ""


@router.post("/credits/adjust")
def adjust_credits(
    body: AdjustRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    credit = db.query(Credit).filter_by(user_id=body.user_id).first()
    if not credit:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="User credit record not found.")
    credit.balance = max(0, credit.balance + body.amount)
    db.commit()
    return {"user_id": body.user_id, "new_balance": credit.balance}
