"""SQLite + filesystem repository for local development and tests.

Every query is scoped by ``user_id`` — the same isolation guarantee that Row Level
Security provides in the Supabase deployment.
"""

from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterator

from .base import AnalysisRecord, CorrectionRecord, SongRecord

_SCHEMA = """
CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    original_filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    audio_path TEXT NOT NULL,
    duration REAL,
    is_favourite INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS songs_user_created ON songs (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL REFERENCES songs (id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    error TEXT,
    model_version TEXT,
    result_json TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT
);
CREATE INDEX IF NOT EXISTS analyses_song_created ON analyses (song_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chord_corrections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    analysis_id TEXT NOT NULL REFERENCES analyses (id) ON DELETE CASCADE,
    start_time REAL NOT NULL,
    original_label TEXT NOT NULL,
    corrected_label TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (analysis_id, start_time)
);
"""


def _now() -> str:
    return datetime.now(UTC).isoformat()


class LocalRepository:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.audio_dir = data_dir / "audio"
        self.audio_dir.mkdir(parents=True, exist_ok=True)
        self.db_path = data_dir / "riffly.sqlite3"
        with self._conn() as conn:
            conn.executescript(_SCHEMA)

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        # A short-lived connection per operation keeps this safe across worker threads.
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    # -- songs --------------------------------------------------------------------------
    def new_audio_path(self, user_id: str, song_id: str, extension: str) -> Path:
        folder = self.audio_dir / user_id
        folder.mkdir(parents=True, exist_ok=True)
        return folder / f"{song_id}{extension}"

    def create_song(self, song: SongRecord) -> SongRecord:
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO songs (id, user_id, title, artist, original_filename, content_type,
                   size_bytes, audio_path, duration, is_favourite, notes, created_at, updated_at)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    song.id, song.user_id, song.title, song.artist, song.original_filename,
                    song.content_type, song.size_bytes, song.audio_path, song.duration,
                    int(song.is_favourite), song.notes, song.created_at, song.updated_at,
                ),
            )
        return song

    def list_songs(self, user_id: str) -> list[SongRecord]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT * FROM songs WHERE user_id = ? ORDER BY created_at DESC", (user_id,)
            ).fetchall()
        return [self._song(r) for r in rows]

    def get_song(self, user_id: str, song_id: str) -> SongRecord | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM songs WHERE id = ? AND user_id = ?", (song_id, user_id)
            ).fetchone()
        return self._song(row) if row else None

    def update_song(self, user_id: str, song_id: str, fields: dict[str, Any]) -> SongRecord | None:
        allowed = {"title", "artist", "notes", "is_favourite", "duration"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        if updates:
            updates["updated_at"] = _now()
            if "is_favourite" in updates:
                updates["is_favourite"] = int(bool(updates["is_favourite"]))
            assignments = ", ".join(f"{k} = ?" for k in updates)
            with self._conn() as conn:
                conn.execute(
                    f"UPDATE songs SET {assignments} WHERE id = ? AND user_id = ?",  # noqa: S608 - keys whitelisted
                    (*updates.values(), song_id, user_id),
                )
        return self.get_song(user_id, song_id)

    def delete_song(self, user_id: str, song_id: str) -> bool:
        song = self.get_song(user_id, song_id)
        if not song:
            return False
        with self._conn() as conn:
            conn.execute("DELETE FROM songs WHERE id = ? AND user_id = ?", (song_id, user_id))
        Path(song.audio_path).unlink(missing_ok=True)
        return True

    # -- analyses -----------------------------------------------------------------------
    def create_analysis(self, song_id: str, status: str) -> AnalysisRecord:
        record = AnalysisRecord(
            id=str(uuid.uuid4()), song_id=song_id, status=status, error=None,
            model_version=None, result=None, created_at=_now(), completed_at=None,
        )
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO analyses (id, song_id, status, created_at) VALUES (?,?,?,?)",
                (record.id, song_id, status, record.created_at),
            )
        return record

    def update_analysis(
        self,
        analysis_id: str,
        status: str,
        *,
        error: str | None = None,
        result: dict[str, Any] | None = None,
    ) -> None:
        done = status in {"completed", "failed"}
        with self._conn() as conn:
            conn.execute(
                """UPDATE analyses SET status = ?, error = ?, result_json = ?, model_version = ?,
                   completed_at = ? WHERE id = ?""",
                (
                    status, error, json.dumps(result) if result else None,
                    result.get("model_version") if result else None,
                    _now() if done else None, analysis_id,
                ),
            )
            if result and "duration" in result:
                conn.execute(
                    """UPDATE songs SET duration = ?, updated_at = ?
                       WHERE id = (SELECT song_id FROM analyses WHERE id = ?)""",
                    (result["duration"], _now(), analysis_id),
                )

    def latest_analysis(self, song_id: str) -> AnalysisRecord | None:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT * FROM analyses WHERE song_id = ? ORDER BY created_at DESC LIMIT 1",
                (song_id,),
            ).fetchone()
        return self._analysis(row) if row else None

    def fail_interrupted(self, reason: str) -> int:
        """Mark jobs left queued/processing by a previous process as failed."""
        with self._conn() as conn:
            cur = conn.execute(
                """UPDATE analyses SET status = 'failed', error = ?, completed_at = ?
                   WHERE status IN ('queued', 'processing')""",
                (reason, _now()),
            )
            return cur.rowcount

    # -- corrections --------------------------------------------------------------------
    def upsert_correction(
        self, user_id: str, analysis_id: str, start: float, original: str, corrected: str
    ) -> CorrectionRecord:
        record = CorrectionRecord(
            id=str(uuid.uuid4()), analysis_id=analysis_id, start=round(start, 3),
            original_label=original, corrected_label=corrected, created_at=_now(),
        )
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO chord_corrections
                   (id, user_id, analysis_id, start_time, original_label, corrected_label, created_at)
                   VALUES (?,?,?,?,?,?,?)
                   ON CONFLICT (analysis_id, start_time) DO UPDATE SET
                   corrected_label = excluded.corrected_label, created_at = excluded.created_at""",
                (record.id, user_id, analysis_id, record.start, original, corrected, record.created_at),
            )
            row = conn.execute(
                "SELECT * FROM chord_corrections WHERE analysis_id = ? AND start_time = ?",
                (analysis_id, record.start),
            ).fetchone()
        return self._correction(row)

    def delete_correction(self, user_id: str, correction_id: str) -> bool:
        with self._conn() as conn:
            cur = conn.execute(
                "DELETE FROM chord_corrections WHERE id = ? AND user_id = ?", (correction_id, user_id)
            )
            return cur.rowcount > 0

    def list_corrections(self, user_id: str, analysis_id: str) -> list[CorrectionRecord]:
        with self._conn() as conn:
            rows = conn.execute(
                """SELECT * FROM chord_corrections WHERE analysis_id = ? AND user_id = ?
                   ORDER BY start_time""",
                (analysis_id, user_id),
            ).fetchall()
        return [self._correction(r) for r in rows]

    # -- row mapping --------------------------------------------------------------------
    @staticmethod
    def _song(row: sqlite3.Row) -> SongRecord:
        data = dict(row)
        data["is_favourite"] = bool(data["is_favourite"])
        return SongRecord(**data)

    @staticmethod
    def _analysis(row: sqlite3.Row) -> AnalysisRecord:
        data = dict(row)
        raw = data.pop("result_json")
        return AnalysisRecord(**data, result=json.loads(raw) if raw else None)

    @staticmethod
    def _correction(row: sqlite3.Row) -> CorrectionRecord:
        return CorrectionRecord(
            id=row["id"], analysis_id=row["analysis_id"], start=row["start_time"],
            original_label=row["original_label"], corrected_label=row["corrected_label"],
            created_at=row["created_at"],
        )
