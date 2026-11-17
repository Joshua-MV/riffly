from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables / backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    # "local": single developer user, no login. Refused in production.
    # "supabase": verify Supabase-issued JWTs (milestone 6).
    auth_mode: Literal["local", "supabase"] = "local"
    storage_backend: Literal["local"] = "local"
    data_dir: Path = Path("data")

    supabase_url: str | None = None
    supabase_jwt_secret: str | None = None

    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:8081", "http://localhost:19006"]
    )

    max_upload_mb: int = 50
    max_duration_minutes: int = 12
    analysis_workers: int = 2
    # "process" isolates CPU-heavy DSP from the API; "thread" is used by tests.
    analysis_executor: Literal["process", "thread"] = "process"

    @model_validator(mode="after")
    def _check_production(self) -> Settings:
        if self.app_env == "production" and self.auth_mode == "local":
            raise ValueError("AUTH_MODE=local is not allowed when APP_ENV=production")
        if self.auth_mode == "supabase" and not self.supabase_url:
            raise ValueError("AUTH_MODE=supabase requires SUPABASE_URL")
        return self

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
