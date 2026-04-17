from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.api.deps import get_current_user, get_db
from app.schemas.generate import GenerateRequest, GenerateResponse
from app.services.generate import GenerationService
from app.models.user import User

router = APIRouter()


@router.post("/generate", response_model=GenerateResponse)
async def generate(
    body: GenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    service = GenerationService(db)
    return await service.run(user=current_user, request=body)
