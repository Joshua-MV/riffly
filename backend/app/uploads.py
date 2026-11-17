"""Safe handling of uploaded audio files."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

CHUNK = 1024 * 1024


@dataclass(frozen=True)
class AudioFormat:
    extension: str
    content_type: str


FORMATS = {
    ".mp3": AudioFormat(".mp3", "audio/mpeg"),
    ".wav": AudioFormat(".wav", "audio/wav"),
    ".m4a": AudioFormat(".m4a", "audio/mp4"),
}


def sniff_format(head: bytes) -> AudioFormat | None:
    """Identify the container from magic bytes - never trust the client's filename/type."""
    if head[:4] == b"RIFF" and head[8:12] == b"WAVE":
        return FORMATS[".wav"]
    if head[:3] == b"ID3" or (len(head) > 1 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0):
        return FORMATS[".mp3"]
    if head[4:8] == b"ftyp" and head[8:12] in {b"M4A ", b"mp42", b"isom", b"M4B ", b"mp41", b"dash"}:
        return FORMATS[".m4a"]
    return None


def _bad(detail: str, code: int = status.HTTP_415_UNSUPPORTED_MEDIA_TYPE) -> HTTPException:
    return HTTPException(status_code=code, detail=detail)


async def save_upload(
    upload: UploadFile, destination_for: Callable[[str], Path], max_bytes: int
) -> tuple[Path, AudioFormat, int]:
    """Validate and stream an upload to disk. ``destination_for(ext)`` returns the target path.

    Returns (path, detected format, size). Partial files are removed on any failure.
    """
    head = await upload.read(16)
    fmt = sniff_format(head)
    if fmt is None:
        raise _bad("Unsupported file. Upload an MP3, WAV or M4A audio file.")
    dest: Path = destination_for(fmt.extension)
    size = len(head)
    try:
        with dest.open("wb") as out:
            out.write(head)
            while chunk := await upload.read(CHUNK):
                size += len(chunk)
                if size > max_bytes:
                    raise _bad(
                        f"File is larger than {max_bytes // (1024 * 1024)} MB.",
                        status.HTTP_413_CONTENT_TOO_LARGE,
                    )
                out.write(chunk)
    except BaseException:
        dest.unlink(missing_ok=True)
        raise
    return dest, fmt, size
