"""Repository contract. Implementations: ``LocalRepository`` (SQLite) today, a Supabase
implementation in milestone 6. Every method that touches user data takes ``user_id``."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol


@dataclass
class SongRecord:
    id: str
    user_id: str
    title: str
    artist: str | None
    original_filename: str
    content_type: str
    size_bytes: int
    audio_path: str
    duration: float | None
    is_favourite: bool
    notes: str | None
    created_at: str
    updated_at: str


@dataclass
class AnalysisRecord:
    id: str
    song_id: str
    status: str
    error: str | None
    model_version: str | None
    result: dict[str, Any] | None
    created_at: str
    completed_at: str | None


@dataclass
class CorrectionRecord:
    id: str
    analysis_id: str
    start: float
    original_label: str
    corrected_label: str
    created_at: str


class Repository(Protocol):
    def new_audio_path(self, user_id: str, song_id: str, extension: str) -> Path: ...
    def create_song(self, song: SongRecord) -> SongRecord: ...
    def list_songs(self, user_id: str) -> list[SongRecord]: ...
    def get_song(self, user_id: str, song_id: str) -> SongRecord | None: ...
    def update_song(self, user_id: str, song_id: str, fields: dict[str, Any]) -> SongRecord | None: ...
    def delete_song(self, user_id: str, song_id: str) -> bool: ...
    def create_analysis(self, song_id: str, status: str) -> AnalysisRecord: ...
    def update_analysis(
        self, analysis_id: str, status: str, *, error: str | None = None,
        result: dict[str, Any] | None = None,
    ) -> None: ...
    def latest_analysis(self, song_id: str) -> AnalysisRecord | None: ...
    def fail_interrupted(self, reason: str) -> int: ...
    def upsert_correction(
        self, user_id: str, analysis_id: str, start: float, original: str, corrected: str
    ) -> CorrectionRecord: ...
    def delete_correction(self, user_id: str, correction_id: str) -> bool: ...
    def list_corrections(self, user_id: str, analysis_id: str) -> list[CorrectionRecord]: ...
