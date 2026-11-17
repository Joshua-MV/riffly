from __future__ import annotations

import logging
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .audio import transcribe
from .audio.pipeline import ENGINE_VERSION
from .config import Settings, get_settings
from .jobs import JobStore
from .routers import analyses, transcriptions


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(
        level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.jobs = JobStore(
            settings.work_dir,
            workers=settings.analysis_workers,
            kind=settings.analysis_executor,
            max_duration=settings.max_duration_minutes * 60,
            ttl=settings.job_ttl_minutes * 60,
            max_active=settings.max_active_jobs,
        )
        yield
        app.state.jobs.shutdown()

    app = FastAPI(
        title="Riffly analysis API",
        version="0.2.0",
        description=(
            "Stateless audio analysis: upload a song, get chords, key and tempo plus an MP3. "
            "Nothing is stored after the client collects the result."
        ),
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["Content-Type", "X-API-Key"],
    )

    @app.middleware("http")
    async def require_api_key(request: Request, call_next):  # type: ignore[no-untyped-def]
        if (
            settings.api_key
            and request.url.path.startswith(("/api/analyses", "/api/transcriptions"))
            and request.method != "OPTIONS"
            and not secrets.compare_digest(request.headers.get("x-api-key", ""), settings.api_key)
        ):
            return JSONResponse({"detail": "Missing or invalid API key"}, status_code=401)
        return await call_next(request)

    app.dependency_overrides[get_settings] = lambda: settings
    app.include_router(analyses.router)
    app.include_router(transcriptions.router)

    @app.get("/api/health", tags=["health"])
    def health() -> dict[str, str | bool]:
        return {
            "status": "ok",
            "engine": ENGINE_VERSION,
            "api_key_required": bool(settings.api_key),
            "transcription_available": transcribe.available(),
        }

    return app


app = create_app()  # uvicorn app.main:app
