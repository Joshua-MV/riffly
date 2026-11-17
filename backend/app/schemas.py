from __future__ import annotations

from enum import Enum

from pydantic import BaseModel


class JobStatus(str, Enum):
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


class JobOut(BaseModel):
    id: str
    title: str
    original_filename: str
    status: JobStatus
    error: str | None = None
    result: AnalysisResultOut | None = None
    # Present once completed: download the MP3 from here, then DELETE the job.
    audio_url: str | None = None
    audio_bytes: int | None = None


class NoteOut(BaseModel):
    start: float
    end: float
    midi: int
    velocity: float


class TranscriptionOut(BaseModel):
    notes: list[NoteOut]
    source: str
    model_version: str
    processing_seconds: float


class TranscriptionJobOut(BaseModel):
    id: str
    status: JobStatus
    error: str | None = None
    result: TranscriptionOut | None = None


class ErrorOut(BaseModel):
    detail: str
