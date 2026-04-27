from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.api.deps import get_current_user, get_db
from app.models.notification import Notification
from app.models.user import User
import uuid

router = APIRouter()


@router.get("/notifications")
def list_notifications(
    limit: int = Query(default=20, ge=1, le=100),
    unread_only: bool = Query(default=False),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Notification).filter(Notification.user_id == current_user.id)
    if unread_only:
        q = q.filter(Notification.is_read == False)
    notifs = q.order_by(Notification.created_at.desc()).limit(limit).all()
    unread_count = db.query(Notification).filter(Notification.user_id == current_user.id, Notification.is_read == False).count()
    return {
        "unread_count": unread_count,
        "notifications": [
            {
                "id": str(n.id),
                "type": n.type,
                "title": n.title,
                "body": n.body,
                "link": n.link,
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat(),
            }
            for n in notifs
        ],
    }


@router.post("/notifications/{notif_id}/read")
def mark_read(
    notif_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    n = db.query(Notification).filter_by(id=notif_id, user_id=current_user.id).first()
    if n:
        n.is_read = True
        db.commit()
    return {"ok": True}


@router.post("/notifications/read-all")
def mark_all_read(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(Notification).filter_by(user_id=current_user.id, is_read=False).update({"is_read": True})
    db.commit()
    return {"ok": True}


class CreateNotifRequest(BaseModel):
    type: str
    title: str
    body: str | None = None
    link: str | None = None


def create_notification(db: Session, user_id, type: str, title: str, body: str | None = None, link: str | None = None):
    n = Notification(id=uuid.uuid4(), user_id=user_id, type=type, title=title, body=body, link=link)
    db.add(n)
    db.commit()
    return n
