from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from environment variables or backend/.env.

    The server is stateless: no database and no permanent storage. `work_dir` holds
    in-flight uploads and MP3s only until the app collects them (or `job_ttl_minutes` passes).
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"
    work_dir: Path = Path("work")

    # Optional shared key. When set, requests must send `X-API-Key`. Use it when the server
    # is reachable from the internet so strangers can't use your analysis server.
    api_key: str | None = None

    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:8081", "http://localhost:19006"]
    )

    max_upload_mb: int = 50
    max_duration_minutes: int = 12
    job_ttl_minutes: int = 30
    max_active_jobs: int = 8
    analysis_workers: int = 2
    # "process" isolates CPU-heavy DSP from the API; "thread" is used by tests.
    analysis_executor: Literal["process", "thread"] = "process"

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
