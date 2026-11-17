from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .audio.pipeline import ENGINE_VERSION
from .config import Settings, get_settings
from .jobs import AnalysisQueue
from .repository.local import LocalRepository
from .routers import songs


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(
        level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        repo = LocalRepository(settings.data_dir)
        interrupted = repo.fail_interrupted("The server restarted during analysis. Please retry.")
        if interrupted:
            logging.getLogger(__name__).warning("marked %d interrupted analyses failed", interrupted)
        app.state.repo = repo
        app.state.queue = AnalysisQueue(
            repo,
            workers=settings.analysis_workers,
            kind=settings.analysis_executor,
            max_duration=settings.max_duration_minutes * 60,
        )
        yield
        app.state.queue.shutdown()

    app = FastAPI(
        title="Riffly API",
        version="0.1.0",
        description="Song upload, audio analysis (chords, key, tempo) and personal library.",
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["Authorization", "Content-Type"],
    )
    app.dependency_overrides[get_settings] = lambda: settings
    app.include_router(songs.router)

    @app.get("/api/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok", "engine": ENGINE_VERSION, "auth_mode": settings.auth_mode}

    return app


app = create_app()  # uvicorn app.main:app
