"""Stripe billing: credit top-up checkout sessions and webhook handler."""
import os
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.credit import Credit
from app.models.credit_transaction import CreditTransaction
from app.models.notification import Notification
import uuid

router = APIRouter()

# Credit packs: price in USD cents → credits
CREDIT_PACKS = [
    {"id": "pack_500",   "credits": 500,   "price_usd": 500,   "label": "Starter — 500 credits"},
    {"id": "pack_1500",  "credits": 1500,  "price_usd": 1200,  "label": "Growth — 1,500 credits"},
    {"id": "pack_5000",  "credits": 5000,  "price_usd": 3500,  "label": "Pro — 5,000 credits"},
    {"id": "pack_15000", "credits": 15000, "price_usd": 9000,  "label": "Scale — 15,000 credits"},
]


@router.get("/billing/packs")
def list_credit_packs():
    return {"packs": CREDIT_PACKS}


@router.get("/billing/transactions")
def get_transactions(
    limit: int = 20,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    txns = (
        db.query(CreditTransaction)
        .filter(CreditTransaction.user_id == current_user.id)
        .order_by(CreditTransaction.created_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "transactions": [
            {
                "id": str(t.id),
                "amount": t.amount,
                "type": t.type,
                "description": t.description,
                "balance_after": t.balance_after,
                "created_at": t.created_at.isoformat(),
            }
            for t in txns
        ]
    }


class CheckoutRequest(BaseModel):
    pack_id: str
    success_url: str = "http://localhost:3000/account?topup=success"
    cancel_url: str = "http://localhost:3000/account"


@router.post("/billing/checkout")
def create_checkout_session(
    body: CheckoutRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        import stripe
        stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
        if not stripe.api_key:
            raise HTTPException(status_code=503, detail={"code": "STRIPE_NOT_CONFIGURED", "message": "Stripe is not configured."})
    except ImportError:
        raise HTTPException(status_code=503, detail={"code": "STRIPE_NOT_INSTALLED", "message": "Install stripe: pip install stripe"})

    pack = next((p for p in CREDIT_PACKS if p["id"] == body.pack_id), None)
    if not pack:
        raise HTTPException(status_code=400, detail={"code": "INVALID_PACK", "message": "Unknown credit pack."})

    # Get or create Stripe customer
    customer_id = current_user.stripe_customer_id
    if not customer_id:
        customer = stripe.Customer.create(email=current_user.email, name=current_user.name or current_user.email)
        customer_id = customer.id
        current_user.stripe_customer_id = customer_id
        db.commit()

    session = stripe.checkout.Session.create(
        customer=customer_id,
        payment_method_types=["card"],
        line_items=[{
            "price_data": {
                "currency": "usd",
                "unit_amount": pack["price_usd"],
                "product_data": {"name": pack["label"]},
            },
            "quantity": 1,
        }],
        mode="payment",
        success_url=body.success_url,
        cancel_url=body.cancel_url,
        metadata={"user_id": str(current_user.id), "credits": str(pack["credits"]), "pack_id": pack["id"]},
    )

    return {"checkout_url": session.url, "session_id": session.id}


@router.post("/billing/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: str = Header(None, alias="stripe-signature"),
    db: Session = Depends(get_db),
):
    try:
        import stripe
        stripe.api_key = os.getenv("STRIPE_SECRET_KEY", "")
        webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    except ImportError:
        raise HTTPException(status_code=503)

    payload = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload, stripe_signature, webhook_secret)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        meta = session.get("metadata", {})
        user_id = meta.get("user_id")
        credits = int(meta.get("credits", 0))
        pack_id = meta.get("pack_id", "")

        if user_id and credits:
            user = db.query(User).filter_by(id=user_id).first()
            if user:
                credit = db.query(Credit).filter_by(user_id=user.id).first()
                if not credit:
                    credit = Credit(id=uuid.uuid4(), user_id=user.id, balance=0)
                    db.add(credit)
                credit.balance += credits
                txn = CreditTransaction(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    amount=credits,
                    type="topup",
                    stripe_payment_intent=session.get("payment_intent"),
                    description=f"Credit top-up: {pack_id}",
                    balance_after=credit.balance,
                )
                db.add(txn)
                notif = Notification(
                    id=uuid.uuid4(),
                    user_id=user.id,
                    type="credits_topup",
                    title=f"+{credits} credits added",
                    body=f"Your purchase of {credits} credits was successful.",
                    link="/account",
                )
                db.add(notif)
                db.commit()

    return {"received": True}
