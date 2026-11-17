"""Experimental note transcription (Demucs guitar stem → Basic Pitch notes). Stateless, like analyses."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from ..audio import transcribe
from ..jobs import JobQueueFull
from ..schemas import ErrorOut, JobStatus, TranscriptionJobOut
from ..uploads import save_upload
from .analyses import SettingsDep, StoreDep

router = APIRouter(prefix="/api/transcriptions", tags=["transcriptions (experimental)"])
NOT_FOUND = {404: {"model": ErrorOut, "description": "Unknown or expired job"}}

# Source separation is slow on CPU (~1–2× the song's length), so cap the length.
MAX_TRANSCRIPTION_SECONDS = 8 * 60


@router.post(
    "",
    response_model=TranscriptionJobOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload audio for experimental note transcription",
    responses={413: {"model": ErrorOut}, 415: {"model": ErrorOut}, 501: {"model": ErrorOut}, 503: {"model": ErrorOut}},
)
async def create_transcription(
    store: StoreDep, settings: SettingsDep, file: Annotated[UploadFile, File(description="Audio file")]
) -> TranscriptionJobOut:
    missing = transcribe.missing_dependencies()
    if missing:
        raise HTTPException(
            status.HTTP_501_NOT_IMPLEMENTED,
            "Transcription isn't installed on this analysis server. Install backend/requirements-transcribe.txt "
            f"(missing: {', '.join(missing)}).",
        )
    job_id, folder = store.new_folder()
    try:
        path, _, _ = await save_upload(file, lambda ext: folder / f"upload{ext}", settings.max_upload_bytes)
        job = store.submit(
            job_id, folder, path, Path(file.filename or "song").stem, file.filename or "song",
            kind="transcription", max_duration=MAX_TRANSCRIPTION_SECONDS,
        )
    except JobQueueFull as exc:
        store.discard_folder(folder)
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "The server is busy. Try again in a minute.") from exc
    except BaseException:
        store.discard_folder(folder)
        raise
    return TranscriptionJobOut(id=job.id, status=JobStatus(job.status))


@router.get("/{job_id}", response_model=TranscriptionJobOut, responses=NOT_FOUND)
def get_transcription(job_id: str, store: StoreDep) -> TranscriptionJobOut:
    job = store.get(job_id, kind="transcription")
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown or expired job")
    return TranscriptionJobOut(id=job.id, status=JobStatus(job.status), error=job.error, result=job.result)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_transcription(job_id: str, store: StoreDep) -> None:
    if not store.get(job_id, kind="transcription") or not store.delete(job_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown or expired job")
