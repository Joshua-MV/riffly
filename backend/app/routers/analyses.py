from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse

from ..config import Settings, get_settings
from ..jobs import Job, JobQueueFull, JobStore
from ..schemas import ErrorOut, JobOut, JobStatus
from ..uploads import save_upload

router = APIRouter(prefix="/api/analyses", tags=["analyses"])
NOT_FOUND = {404: {"model": ErrorOut, "description": "Unknown or expired job"}}


def get_store(request: Request) -> JobStore:
    return request.app.state.jobs


StoreDep = Annotated[JobStore, Depends(get_store)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def _out(request: Request, job: Job) -> JobOut:
    done = job.status == "completed" and job.mp3_path.exists()
    return JobOut(
        id=job.id,
        title=job.title,
        original_filename=job.original_filename,
        status=JobStatus(job.status),
        error=job.error,
        result=job.result,
        audio_url=str(request.url_for("job_audio", job_id=job.id)) if done else None,
        audio_bytes=job.mp3_path.stat().st_size if done else None,
    )


def _require(store: JobStore, job_id: str) -> Job:
    job = store.get(job_id)
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown or expired job")
    return job


@router.post(
    "",
    response_model=JobOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload audio (MP3, WAV, M4A) for analysis and MP3 conversion",
    responses={413: {"model": ErrorOut}, 415: {"model": ErrorOut}, 503: {"model": ErrorOut}},
)
async def create_job(
    request: Request,
    store: StoreDep,
    settings: SettingsDep,
    file: Annotated[UploadFile, File(description="Audio file")],
    title: Annotated[str | None, Form(max_length=200)] = None,
) -> JobOut:
    job_id, folder = store.new_folder()
    try:
        path, _, _ = await save_upload(file, lambda ext: folder / f"upload{ext}", settings.max_upload_bytes)
        filename = Path(file.filename or path.name).name[:255]
        job = store.submit(
            job_id, folder, path, (title or Path(filename).stem).strip()[:200] or "Untitled", filename
        )
    except JobQueueFull as exc:
        store.discard_folder(folder)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "The analysis server is busy. Try again in a minute."
        ) from exc
    except BaseException:
        store.discard_folder(folder)
        raise
    return _out(request, job)


@router.get("/{job_id}", response_model=JobOut, responses=NOT_FOUND)
def get_job(job_id: str, request: Request, store: StoreDep) -> JobOut:
    return _out(request, _require(store, job_id))


@router.get("/{job_id}/audio", name="job_audio", responses=NOT_FOUND, summary="Download the MP3")
def job_audio(job_id: str, store: StoreDep) -> FileResponse:
    job = _require(store, job_id)
    if job.status != "completed" or not job.mp3_path.exists():
        raise HTTPException(status.HTTP_409_CONFLICT, "Audio is not ready")
    safe = "".join(c for c in job.title if c.isalnum() or c in " -_()").strip() or "song"
    return FileResponse(job.mp3_path, media_type="audio/mpeg", filename=f"{safe}.mp3")


@router.delete(
    "/{job_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND,
    summary="Forget a job and delete its files (call after saving to the device)",
)
def delete_job(job_id: str, store: StoreDep) -> None:
    if not store.delete(job_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown or expired job")
