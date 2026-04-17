import os
from app.config import settings


class OutputService:
    def save(
        self,
        user_id: str,
        request_id: str,
        modality: str,
        content: str | None,
        file_bytes: bytes | None,
        file_extension: str | None,
    ) -> str | None:
        if modality == "text":
            dir_path = os.path.join(settings.OUTPUT_DIR, user_id, request_id)
            os.makedirs(dir_path, exist_ok=True)
            file_path = os.path.join(dir_path, "result.txt")
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            return f"{settings.BASE_URL}/files/{user_id}/{request_id}/result.txt"

        if modality == "image" and file_bytes:
            dir_path = os.path.join(settings.OUTPUT_DIR, user_id, request_id)
            os.makedirs(dir_path, exist_ok=True)
            file_path = os.path.join(dir_path, f"result.{file_extension}")
            with open(file_path, "wb") as f:
                f.write(file_bytes)
            return f"{settings.BASE_URL}/files/{user_id}/{request_id}/result.{file_extension}"

        return None
