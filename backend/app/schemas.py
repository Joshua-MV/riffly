from __future__ import annotations

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


class AnalysisStatus(str, Enum):
    uploaded = "uploaded"
    queued = "queued"
    processing = "processing"
    completed = "completed"
    failed = "failed"


class ChordSegmentOut(BaseModel):
    start: float
    end: float
    label: str
    root: int | None
    quality: str | None
    confidence: float


class AnalysisResultOut(BaseModel):
    duration: float
    key: str | None
    key_confidence: float | None
    bpm: float | None
    bpm_confidence: float | None
    chords: list[ChordSegmentOut]
    progression: list[str]
    beats: list[float]
    waveform: list[float]
    model_version: str
    processing_seconds: float
    notes: list[str]


class AnalysisOut(BaseModel):
    id: str
    song_id: str
    status: AnalysisStatus
    error: str | None = None
    model_version: str | None = None
    created_at: datetime
    completed_at: datetime | None = None
    result: AnalysisResultOut | None = None


class CorrectionIn(BaseModel):
    start: float = Field(ge=0, description="Start time (s) of the chord segment being corrected")
    original_label: str = Field(min_length=1, max_length=16)
    corrected_label: str = Field(min_length=1, max_length=16, pattern=r"^(N|[A-G](#|b)?[A-Za-z0-9#b/+()]*)$")


class CorrectionOut(CorrectionIn):
    id: str
    analysis_id: str
    created_at: datetime


class SongOut(BaseModel):
    id: str
    title: str
    artist: str | None
    original_filename: str
    content_type: str
    size_bytes: int
    duration: float | None
    is_favourite: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime
    status: AnalysisStatus
    key: str | None = None
    bpm: float | None = None


class SongDetailOut(SongOut):
    audio_url: str
    analysis: AnalysisOut | None
    corrections: list[CorrectionOut]


class SongUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    artist: str | None = Field(default=None, max_length=200)
    notes: str | None = Field(default=None, max_length=5000)
    is_favourite: bool | None = None


class ErrorOut(BaseModel):
    detail: str
