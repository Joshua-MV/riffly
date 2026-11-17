from __future__ import annotations

import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse

from ..auth import UserDep
from ..config import Settings, get_settings
from ..jobs import AnalysisQueue
from ..repository.base import AnalysisRecord, Repository, SongRecord
from ..schemas import (
    AnalysisOut,
    AnalysisStatus,
    CorrectionIn,
    CorrectionOut,
    ErrorOut,
    SongDetailOut,
    SongOut,
    SongUpdate,
)
from ..uploads import save_upload

router = APIRouter(prefix="/api/songs", tags=["songs"])

NOT_FOUND = {404: {"model": ErrorOut, "description": "Song not found"}}


def get_repo(request: Request) -> Repository:
    return request.app.state.repo


def get_queue(request: Request) -> AnalysisQueue:
    return request.app.state.queue


RepoDep = Annotated[Repository, Depends(get_repo)]
QueueDep = Annotated[AnalysisQueue, Depends(get_queue)]
SettingsDep = Annotated[Settings, Depends(get_settings)]


def _analysis_out(a: AnalysisRecord | None) -> AnalysisOut | None:
    if a is None:
        return None
    return AnalysisOut(
        id=a.id, song_id=a.song_id, status=AnalysisStatus(a.status), error=a.error,
        model_version=a.model_version, created_at=a.created_at, completed_at=a.completed_at,
        result=a.result,
    )


def _song_out(song: SongRecord, analysis: AnalysisRecord | None) -> dict:
    result = analysis.result if analysis and analysis.result else {}
    return {
        **{k: v for k, v in song.__dict__.items() if k not in {"user_id", "audio_path"}},
        "status": AnalysisStatus(analysis.status) if analysis else AnalysisStatus.uploaded,
        "key": result.get("key"),
        "bpm": result.get("bpm"),
    }


def _require_song(repo: Repository, user_id: str, song_id: str) -> SongRecord:
    song = repo.get_song(user_id, song_id)
    if not song:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Song not found")
    return song


def _detail(request: Request, repo: Repository, user_id: str, song: SongRecord) -> SongDetailOut:
    analysis = repo.latest_analysis(song.id)
    corrections = repo.list_corrections(user_id, analysis.id) if analysis else []
    return SongDetailOut(
        **_song_out(song, analysis),
        audio_url=str(request.url_for("song_audio", song_id=song.id)),
        analysis=_analysis_out(analysis),
        corrections=[CorrectionOut(**c.__dict__) for c in corrections],
    )


@router.get("", response_model=list[SongOut], summary="List the current user's songs")
def list_songs(user: UserDep, repo: RepoDep) -> list[dict]:
    return [_song_out(s, repo.latest_analysis(s.id)) for s in repo.list_songs(user.id)]


@router.post(
    "",
    response_model=SongDetailOut,
    status_code=status.HTTP_201_CREATED,
    summary="Upload an audio file (MP3, WAV, M4A) and optionally start analysis",
    responses={413: {"model": ErrorOut}, 415: {"model": ErrorOut}},
)
async def upload_song(
    request: Request,
    user: UserDep,
    repo: RepoDep,
    queue: QueueDep,
    settings: SettingsDep,
    file: Annotated[UploadFile, File(description="Audio file")],
    title: Annotated[str | None, Form(max_length=200)] = None,
    artist: Annotated[str | None, Form(max_length=200)] = None,
    analyze: Annotated[bool, Form()] = True,
) -> SongDetailOut:
    song_id = str(uuid.uuid4())
    path, fmt, size = await save_upload(
        file, lambda ext: repo.new_audio_path(user.id, song_id, ext), settings.max_upload_bytes
    )
    filename = Path(file.filename or f"upload{fmt.extension}").name[:255]
    now = datetime.now(UTC).isoformat()
    song = repo.create_song(
        SongRecord(
            id=song_id, user_id=user.id, title=(title or Path(filename).stem).strip()[:200] or "Untitled",
            artist=artist.strip() if artist else None, original_filename=filename,
            content_type=fmt.content_type, size_bytes=size, audio_path=str(path), duration=None,
            is_favourite=False, notes=None, created_at=now, updated_at=now,
        )
    )
    if analyze:
        queue.enqueue(song.id, song.audio_path)
    return _detail(request, repo, user.id, song)


@router.get("/{song_id}", response_model=SongDetailOut, responses=NOT_FOUND)
def get_song(song_id: str, request: Request, user: UserDep, repo: RepoDep) -> SongDetailOut:
    return _detail(request, repo, user.id, _require_song(repo, user.id, song_id))


@router.patch("/{song_id}", response_model=SongDetailOut, responses=NOT_FOUND)
def update_song(
    song_id: str, body: SongUpdate, request: Request, user: UserDep, repo: RepoDep
) -> SongDetailOut:
    _require_song(repo, user.id, song_id)
    song = repo.update_song(user.id, song_id, body.model_dump(exclude_unset=True))
    assert song is not None
    return _detail(request, repo, user.id, song)


@router.delete("/{song_id}", status_code=status.HTTP_204_NO_CONTENT, responses=NOT_FOUND)
def delete_song(song_id: str, user: UserDep, repo: RepoDep) -> None:
    if not repo.delete_song(user.id, song_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Song not found")


@router.post(
    "/{song_id}/analyze",
    response_model=AnalysisOut,
    status_code=status.HTTP_202_ACCEPTED,
    summary="(Re)run analysis for a song",
    responses={**NOT_FOUND, 409: {"model": ErrorOut}},
)
def analyze_song(song_id: str, user: UserDep, repo: RepoDep, queue: QueueDep) -> AnalysisOut:
    song = _require_song(repo, user.id, song_id)
    current = repo.latest_analysis(song.id)
    if current and current.status in {"queued", "processing"}:
        raise HTTPException(status.HTTP_409_CONFLICT, "Analysis is already running")
    queue.enqueue(song.id, song.audio_path)
    out = _analysis_out(repo.latest_analysis(song.id))
    assert out is not None
    return out


@router.get("/{song_id}/analysis", response_model=AnalysisOut, responses=NOT_FOUND)
def get_analysis(song_id: str, user: UserDep, repo: RepoDep) -> AnalysisOut:
    _require_song(repo, user.id, song_id)
    out = _analysis_out(repo.latest_analysis(song_id))
    if out is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "This song has not been analysed")
    return out


@router.get("/{song_id}/audio", name="song_audio", responses=NOT_FOUND)
def song_audio(song_id: str, user: UserDep, repo: RepoDep) -> FileResponse:
    song = _require_song(repo, user.id, song_id)
    # FileResponse honours HTTP Range requests, which browsers need for seeking.
    return FileResponse(song.audio_path, media_type=song.content_type)


@router.put(
    "/{song_id}/corrections",
    response_model=CorrectionOut,
    summary="Correct (or re-correct) the chord label of one segment",
    responses={**NOT_FOUND, 409: {"model": ErrorOut}},
)
def correct_chord(
    song_id: str, body: CorrectionIn, user: UserDep, repo: RepoDep
) -> CorrectionOut:
    _require_song(repo, user.id, song_id)
    analysis = repo.latest_analysis(song_id)
    if not analysis or analysis.status != "completed":
        raise HTTPException(status.HTTP_409_CONFLICT, "Analysis is not complete")
    record = repo.upsert_correction(
        user.id, analysis.id, body.start, body.original_label, body.corrected_label
    )
    return CorrectionOut(**record.__dict__)


@router.delete(
    "/{song_id}/corrections/{correction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
)
def revert_correction(song_id: str, correction_id: str, user: UserDep, repo: RepoDep) -> None:
    _require_song(repo, user.id, song_id)
    if not repo.delete_correction(user.id, correction_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Correction not found")
