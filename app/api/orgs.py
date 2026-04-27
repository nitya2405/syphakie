"""Organization/team management — multi-org, roles, credits, audit."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.models.organization import Organization, OrgMembership
from app.models.audit_log import AuditLog
from app.models.credit import Credit
import uuid as _uuid, re

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────────────────────

def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def _get_org(org_id: str, db: Session) -> Organization:
    try:
        uid = _uuid.UUID(org_id)
    except ValueError:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Org not found."})
    org = db.query(Organization).filter(Organization.id == uid).first()
    if not org:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND", "message": "Org not found."})
    return org


def _get_my_role(org_id, user_id, db: Session) -> Optional[str]:
    m = db.query(OrgMembership).filter_by(org_id=org_id, user_id=user_id).first()
    return m.role if m else None


def _require_role(org_id, user: User, db: Session, min_roles: tuple) -> str:
    role = _get_my_role(org_id, user.id, db)
    if role not in min_roles:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": f"Requires one of: {', '.join(min_roles)}."})
    return role


def _serialize_org(org: Organization, my_role: str | None = None) -> dict:
    d = {
        "id": str(org.id),
        "name": org.name,
        "slug": org.slug,
        "description": org.description,
        "owner_id": str(org.owner_id),
        "credits_balance": org.credits_balance,
        "created_at": org.created_at.isoformat(),
    }
    if my_role is not None:
        d["my_role"] = my_role
    return d


def _notify(db: Session, user_id, type: str, title: str, body_text: str | None = None, link: str | None = None):
    from app.api.notifications import create_notification
    try:
        create_notification(db, user_id, type, title, body_text, link)
    except Exception:
        pass


def _audit(db: Session, user_id, org_id, action: str, resource_type: str | None = None, resource_id: str | None = None):
    try:
        db.add(AuditLog(id=_uuid.uuid4(), user_id=user_id, org_id=org_id, action=action, resource_type=resource_type, resource_id=resource_id))
        db.commit()
    except Exception:
        pass


def _org_members(org_id, db: Session):
    rows = (
        db.query(OrgMembership, User)
        .join(User, OrgMembership.user_id == User.id)
        .filter(OrgMembership.org_id == org_id)
        .all()
    )
    member_ids = [str(u.id) for _, u in rows]
    credits_map: dict[str, int] = {}
    if member_ids:
        for c in db.query(Credit).filter(Credit.user_id.in_(member_ids)).all():
            credits_map[str(c.user_id)] = c.balance
    return [
        {
            "user_id": str(u.id),
            "email": u.email,
            "name": u.name,
            "role": m.role,
            "joined_at": m.joined_at.isoformat(),
            "credits_balance": credits_map.get(str(u.id), 0),
        }
        for m, u in rows
    ]


# ── Create ────────────────────────────────────────────────────────────────────

class CreateOrgRequest(BaseModel):
    name: str
    description: Optional[str] = None


@router.post("/orgs/create")
def create_org(
    body: CreateOrgRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    base_slug = _slug(body.name)
    slug = base_slug
    counter = 1
    while db.query(Organization).filter_by(slug=slug).first():
        slug = f"{base_slug}-{counter}"
        counter += 1

    org = Organization(id=_uuid.uuid4(), name=body.name, slug=slug, owner_id=current_user.id, description=body.description)
    db.add(org)
    db.flush()

    membership = OrgMembership(id=_uuid.uuid4(), org_id=org.id, user_id=current_user.id, role="owner")
    db.add(membership)

    # Set as active org (first org takes precedence)
    if not current_user.org_id:
        current_user.org_id = org.id

    db.commit()
    _audit(db, current_user.id, org.id, "org_created", "org", str(org.id))

    return {"org": _serialize_org(org, my_role="owner")}


# ── List all my orgs ──────────────────────────────────────────────────────────

@router.get("/orgs/mine")
def list_my_orgs(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(OrgMembership, Organization)
        .join(Organization, OrgMembership.org_id == Organization.id)
        .filter(OrgMembership.user_id == current_user.id)
        .order_by(Organization.created_at)
        .all()
    )
    return {
        "active_org_id": str(current_user.org_id) if current_user.org_id else None,
        "orgs": [
            {
                **_serialize_org(org, my_role=m.role),
                "is_active": current_user.org_id is not None and org.id == current_user.org_id,
            }
            for m, org in rows
        ],
    }


# ── Active org — MUST be before /orgs/{org_id} to avoid param capture ────────

@router.get("/orgs/me")
def get_my_org(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not current_user.org_id:
        return {"org": None}
    org = db.query(Organization).filter(Organization.id == current_user.org_id).first()
    if not org:
        return {"org": None}
    role = _get_my_role(org.id, current_user.id, db)
    return {
        "org": _serialize_org(org, my_role=role),
        "members": _org_members(org.id, db),
    }


# ── Get specific org ──────────────────────────────────────────────────────────

@router.get("/orgs/{org_id}")
def get_org(
    org_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org(org_id, db)
    role = _get_my_role(org.id, current_user.id, db)
    if not role:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN"})
    return {
        "org": _serialize_org(org, my_role=role),
        "members": _org_members(org.id, db),
    }


# ── Switch active org ─────────────────────────────────────────────────────────

@router.post("/orgs/switch/{org_id}")
def switch_active_org(
    org_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org(org_id, db)
    role = _get_my_role(org.id, current_user.id, db)
    if not role:
        raise HTTPException(status_code=403, detail={"code": "FORBIDDEN", "message": "You are not a member of this org."})
    current_user.org_id = org.id
    db.commit()
    return {"ok": True, "active_org_id": org_id, "org": _serialize_org(org, my_role=role)}


# ── Edit org ──────────────────────────────────────────────────────────────────

class UpdateOrgRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


@router.patch("/orgs/{org_id}")
def update_org(
    org_id: str,
    body: UpdateOrgRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org(org_id, db)
    _require_role(org.id, current_user, db, ("owner", "admin"))

    if body.name is not None:
        org.name = body.name.strip()
    if body.description is not None:
        org.description = body.description.strip() or None
    db.commit()
    _audit(db, current_user.id, org.id, "org_updated", "org", str(org.id))
    role = _get_my_role(org.id, current_user.id, db)
    return {"org": _serialize_org(org, my_role=role)}


# ── Delete org ────────────────────────────────────────────────────────────────

@router.delete("/orgs/{org_id}")
def delete_org(
    org_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org(org_id, db)
    _require_role(org.id, current_user, db, ("owner",))

    # Clear active_org_id for all members who had this org active
    db.query(User).filter(User.org_id == org.id).update({"org_id": None})

    db.delete(org)   # CASCADE removes org_memberships
    db.commit()
    return {"ok": True}


# ── Add credits to org from personal balance ──────────────────────────────────

class AddOrgCreditsRequest(BaseModel):
    amount: int


@router.post("/orgs/{org_id}/credits/add")
def add_credits_to_org(
    org_id: str,
    body: AddOrgCreditsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org(org_id, db)
    _require_role(org.id, current_user, db, ("owner", "admin"))

    if body.amount <= 0:
        raise HTTPException(status_code=400, detail={"code": "INVALID_AMOUNT", "message": "Amount must be positive."})

    personal = db.query(Credit).filter_by(user_id=current_user.id).with_for_update().first()
    if not personal or personal.balance < body.amount:
        raise HTTPException(status_code=400, detail={"code": "INSUFFICIENT_CREDITS", "message": f"You only have {personal.balance if personal else 0} personal credits."})

    personal.balance -= body.amount
    org.credits_balance += body.amount
    db.commit()
    _audit(db, current_user.id, org.id, "org_credits_added", "org", str(org.id))

    return {"ok": True, "org_balance": org.credits_balance, "personal_balance": personal.balance}


# ── Leave org ─────────────────────────────────────────────────────────────────

@router.post("/orgs/{org_id}/leave")
def leave_org(
    org_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org(org_id, db)
    membership = db.query(OrgMembership).filter_by(org_id=org.id, user_id=current_user.id).first()
    if not membership:
        raise HTTPException(status_code=404, detail={"code": "NOT_MEMBER"})
    if membership.role == "owner":
        raise HTTPException(status_code=400, detail={"code": "OWNER_CANNOT_LEAVE", "message": "Transfer ownership before leaving."})

    db.delete(membership)
    if current_user.org_id == org.id:
        current_user.org_id = None
    db.commit()
    return {"ok": True}


# ── Transfer ownership ────────────────────────────────────────────────────────

class TransferOwnerRequest(BaseModel):
    new_owner_id: str


@router.patch("/orgs/{org_id}/transfer-owner")
def transfer_ownership(
    org_id: str,
    body: TransferOwnerRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    org = _get_org(org_id, db)
    _require_role(org.id, current_user, db, ("owner",))

    try:
        new_owner_uid = _uuid.UUID(body.new_owner_id)
    except ValueError:
        raise HTTPException(status_code=400, detail={"code": "INVALID_ID"})

    target = db.query(OrgMembership).filter_by(org_id=org.id, user_id=new_owner_uid).first()
    if not target:
        raise HTTPException(status_code=404, detail={"code": "NOT_MEMBER", "message": "New owner must already be a member."})

    my_membership = db.query(OrgMembership).filter_by(org_id=org.id, user_id=current_user.id).first()
    my_membership.role = "admin"
    target.role = "owner"
    org.owner_id = new_owner_uid
    db.commit()

    new_owner = db.query(User).filter(User.id == new_owner_uid).first()
    _notify(db, new_owner_uid, "system", f"You are now owner of {org.name}", None, "/team")
    _audit(db, current_user.id, org.id, "ownership_transferred", "org", str(org.id))

    return {"ok": True}


# ── Member management (operates on active org) ────────────────────────────────

class InviteRequest(BaseModel):
    email: str
    role: str = "member"
    org_id: Optional[str] = None   # if omitted, uses current active org


@router.post("/orgs/invite")
def invite_member(
    body: InviteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_org_id = _uuid.UUID(body.org_id) if body.org_id else current_user.org_id
    if not target_org_id:
        raise HTTPException(status_code=400, detail={"code": "NO_ORG", "message": "Specify an org or set an active org."})

    _require_role(target_org_id, current_user, db, ("owner", "admin"))

    invitee = db.query(User).filter_by(email=body.email.lower()).first()
    if not invitee:
        raise HTTPException(status_code=404, detail={"code": "USER_NOT_FOUND", "message": "No user with that email."})

    if db.query(OrgMembership).filter_by(org_id=target_org_id, user_id=invitee.id).first():
        raise HTTPException(status_code=409, detail={"code": "ALREADY_MEMBER", "message": "User is already a member."})

    org = db.query(Organization).filter(Organization.id == target_org_id).first()

    db.add(OrgMembership(id=_uuid.uuid4(), org_id=target_org_id, user_id=invitee.id, role=body.role, invited_by=current_user.id))
    if not invitee.org_id:
        invitee.org_id = target_org_id
    db.commit()

    _notify(db, invitee.id, "team_invite",
            f"You've been added to {org.name}",
            f"{current_user.name or current_user.email} added you as {body.role}.",
            "/team")

    admins = (
        db.query(OrgMembership, User)
        .join(User, OrgMembership.user_id == User.id)
        .filter(OrgMembership.org_id == target_org_id, OrgMembership.role.in_(("owner", "admin")), OrgMembership.user_id != current_user.id)
        .all()
    )
    for _, admin_user in admins:
        _notify(db, admin_user.id, "team_invite",
                f"New member in {org.name}",
                f"{invitee.email} added as {body.role} by {current_user.name or current_user.email}.",
                "/team")

    return {"ok": True, "member": {"user_id": str(invitee.id), "email": invitee.email, "role": body.role}}


class UpdateRoleRequest(BaseModel):
    user_id: str
    role: str
    org_id: Optional[str] = None


@router.patch("/orgs/member-role")
def update_member_role(
    body: UpdateRoleRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_org_id = _uuid.UUID(body.org_id) if body.org_id else current_user.org_id
    if not target_org_id:
        raise HTTPException(status_code=400, detail={"code": "NO_ORG"})

    _require_role(target_org_id, current_user, db, ("owner",))

    target = db.query(OrgMembership).filter_by(org_id=target_org_id, user_id=body.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail={"code": "NOT_FOUND"})

    target.role = body.role
    db.commit()
    return {"ok": True}


@router.delete("/orgs/member/{user_id}")
def remove_member(
    user_id: str,
    org_id: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_org_id = _uuid.UUID(org_id) if org_id else current_user.org_id
    if not target_org_id:
        raise HTTPException(status_code=400, detail={"code": "NO_ORG"})

    _require_role(target_org_id, current_user, db, ("owner", "admin"))

    target = db.query(OrgMembership).filter_by(org_id=target_org_id, user_id=user_id).first()
    if target:
        db.delete(target)
        u = db.query(User).filter_by(id=user_id).first()
        if u and str(u.org_id) == str(target_org_id):
            u.org_id = None
        db.commit()
    return {"ok": True}


# ── Allot credits from org pool to member ────────────────────────────────────

class AllotCreditsRequest(BaseModel):
    user_id: str
    amount: int
    org_id: Optional[str] = None


@router.post("/orgs/credits/allot")
def allot_credits(
    body: AllotCreditsRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    target_org_id = _uuid.UUID(body.org_id) if body.org_id else current_user.org_id
    if not target_org_id:
        raise HTTPException(status_code=400, detail={"code": "NO_ORG"})

    _require_role(target_org_id, current_user, db, ("owner", "admin"))

    if body.amount <= 0:
        raise HTTPException(status_code=400, detail={"code": "INVALID_AMOUNT", "message": "Amount must be positive."})

    if not db.query(OrgMembership).filter_by(org_id=target_org_id, user_id=body.user_id).first():
        raise HTTPException(status_code=404, detail={"code": "NOT_MEMBER"})

    org = db.query(Organization).filter(Organization.id == target_org_id).with_for_update().first()
    if org.credits_balance < body.amount:
        raise HTTPException(status_code=400, detail={"code": "INSUFFICIENT_ORG_CREDITS", "message": f"Org only has {org.credits_balance} credits."})

    member_credit = db.query(Credit).filter_by(user_id=body.user_id).first()
    if not member_credit:
        raise HTTPException(status_code=404, detail={"code": "NO_CREDIT_RECORD"})

    org.credits_balance -= body.amount
    member_credit.balance += body.amount
    db.commit()

    _notify(db, body.user_id, "credits_added",
            f"{body.amount} credits allotted",
            f"An org admin allotted {body.amount} credits to your account.",
            "/account")

    return {"ok": True, "org_balance": org.credits_balance, "member_balance": member_credit.balance}
