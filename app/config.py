from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str = "postgresql://syphakie:syphakie@localhost:5432/syphakie"
    OPENAI_API_KEY: str = ""
    STABILITY_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    XAI_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    QWEN_API_KEY: str = ""
    FAL_API_KEY: str = ""
    OUTPUT_DIR: str = "outputs"
    BASE_URL: str = "http://localhost:8000"
    DEFAULT_CREDITS: int = 1000

    # Telegram
    TELEGRAM_BOT_TOKEN: str = ""
    TELEGRAM_BOT_USERNAME: str = ""        # e.g. "SyphaKieBot" (no @)
    TELEGRAM_WEBHOOK_URL: str = ""         # if set → webhook mode; else long-polling
    TELEGRAM_WEBHOOK_SECRET: str = ""      # optional HMAC header for webhook verification


settings = Settings()
