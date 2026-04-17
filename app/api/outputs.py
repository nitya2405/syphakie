import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.config import settings

router = APIRouter()


@router.get("/outputs/{request_id}")
def get_output(
    request_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user_id = str(current_user.id)
    base = os.path.join(settings.OUTPUT_DIR, user_id, request_id)

    for filename in ("result.txt", "result.png", "result.jpg"):
        full_path = os.path.join(base, filename)
        if os.path.exists(full_path):
            ext = filename.split(".")[-1]
            modality = "text" if ext == "txt" else "image"
            url = f"{settings.BASE_URL}/files/{user_id}/{request_id}/{filename}"
            return {
                "request_id": request_id,
                "modality": modality,
                "output": {
                    "type": modality,
                    "url": url,
                    "content": None,
                },
            }

    raise HTTPException(status_code=404, detail={
        "code": "OUTPUT_NOT_FOUND",
        "message": f"No output found for request_id '{request_id}'.",
    })
