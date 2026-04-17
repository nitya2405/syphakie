import os
from app.config import settings

_EXT_MAP = {
    "video": "mp4",
    "audio": "mp3",
    "image": "jpg",
    "text": "txt",
}


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
        dir_path = os.path.join(settings.OUTPUT_DIR, user_id, request_id)
        os.makedirs(dir_path, exist_ok=True)

        if modality == "text" and content is not None:
            file_path = os.path.join(dir_path, "result.txt")
            with open(file_path, "w", encoding="utf-8") as f:
                f.write(content)
            return f"{settings.BASE_URL}/files/{user_id}/{request_id}/result.txt"

        if modality in ("image", "video", "audio") and file_bytes:
            ext = file_extension or _EXT_MAP.get(modality, "bin")
            file_path = os.path.join(dir_path, f"result.{ext}")
            with open(file_path, "wb") as f:
                f.write(file_bytes)
            return f"{settings.BASE_URL}/files/{user_id}/{request_id}/result.{ext}"

        return None
