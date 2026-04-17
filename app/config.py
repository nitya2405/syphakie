from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str = "postgresql://syphakie:syphakie@localhost:5432/syphakie"
    OPENAI_API_KEY: str = ""
    STABILITY_API_KEY: str = ""
    OUTPUT_DIR: str = "outputs"
    BASE_URL: str = "http://localhost:8000"
    DEFAULT_CREDITS: int = 1000


settings = Settings()
