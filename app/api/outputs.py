import os
import uuid
import shutil
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.models.user import User
from app.config import settings

router = APIRouter()


@router.post("/outputs/upload")
async def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    """Upload a file to the platform and get a temporary URL."""
    user_id = str(current_user.id)
    file_id = str(uuid.uuid4())
    ext = file.filename.split(".")[-1].lower() if "." in file.filename else ""
    
    # Simple validation
    allowed_exts = {
        "png", "jpg", "jpeg", "webp", "gif", # images
        "mp3", "wav", "ogg", "m4a",         # audio
        "mp4", "webm", "mov",                # video
        "pdf", "doc", "docx", "txt",         # docs
    }
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"File extension '.{ext}' not allowed.")

    upload_dir = os.path.join(settings.OUTPUT_DIR, "uploads", user_id)
    os.makedirs(upload_dir, exist_ok=True)
    
    filename = f"{file_id}.{ext}" if ext else file_id
    file_path = os.path.join(upload_dir, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    url = f"{settings.BASE_URL}/files/uploads/{user_id}/{filename}"
    return {"url": url, "filename": file.filename}


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
            content = None
            if ext == "txt":
                with open(full_path, "r", encoding="utf-8") as f:
                    content = f.read()
            return {
                "request_id": request_id,
                "modality": modality,
                "output": {
                    "type": modality,
                    "url": url,
                    "content": content,
                },
            }

    raise HTTPException(status_code=404, detail={
        "code": "OUTPUT_NOT_FOUND",
        "message": f"No output found for request_id '{request_id}'.",
    })
