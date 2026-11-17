"""Stateless analysis jobs.

The server keeps no database and no long-term files. An upload becomes a job in memory;
a worker analyses it and converts it to MP3. The app downloads the result and the MP3,
saves both on the user's device, then deletes the job. Anything not collected expires
after `ttl` seconds, and the work directory is wiped on startup.

Job ids are random UUIDs, so only the client that created a job can find it.
"""

from __future__ import annotations

import logging
import shutil
import threading
import time
import uuid
from concurrent.futures import Executor, Future, ProcessPoolExecutor, ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path

from .audio.mp3 import convert_to_mp3
from .audio.pipeline import AudioDecodeError, AudioTooLongError, analyze_file

log = logging.getLogger(__name__)


def process_upload(upload_path: str, mp3_path: str, max_duration: float) -> dict:
    """Worker entry point (top-level so it can run in a process pool)."""
    result = analyze_file(Path(upload_path), max_duration=max_duration).to_dict()
    convert_to_mp3(Path(upload_path), Path(mp3_path))
    return result


def process_transcription(upload_path: str, _mp3_path: str, max_duration: float) -> dict:
    from .audio.pipeline import load_audio
    from .audio.transcribe import transcribe_file

    load_audio(Path(upload_path), max_duration)  # validates decodability and length
    return transcribe_file(Path(upload_path))


WORKERS = {"analysis": process_upload, "transcription": process_transcription}


@dataclass
class Job:
    id: str
    title: str
    original_filename: str
    folder: Path
    upload_path: Path
    kind: str = "analysis"  # analysis | transcription
    status: str = "processing"  # processing | completed | failed
    error: str | None = None
    result: dict | None = None
    created_at: float = field(default_factory=time.time)
    finished_at: float | None = None

    @property
    def mp3_path(self) -> Path:
        return self.folder / "audio.mp3"


class JobQueueFull(Exception):
    pass


class JobStore:
    def __init__(
        self, work_dir: Path, *, workers: int, kind: str, max_duration: float, ttl: float, max_active: int,
        idle_shutdown: float = 300,
    ) -> None:
        self.work_dir = work_dir
        self.max_duration = max_duration
        self.ttl = ttl
        self.max_active = max_active
        self._jobs: dict[str, Job] = {}
        self._lock = threading.Lock()
        # Stateless: nothing from a previous run is kept.
        shutil.rmtree(work_dir, ignore_errors=True)
        work_dir.mkdir(parents=True, exist_ok=True)
        # Worker processes hold librosa/numba (~250 MB each), so they are started only when a
        # job arrives and shut down after `idle_shutdown` seconds without work.
        self._workers = workers
        self._kind = kind
        self._idle_shutdown = idle_shutdown
        self._executor: Executor | None = None
        self._inflight = 0
        self._idle_timer: threading.Timer | None = None

    @property
    def executor_running(self) -> bool:
        return self._executor is not None

    def _get_executor(self) -> Executor:
        # Caller holds self._lock.
        if self._idle_timer:
            self._idle_timer.cancel()
            self._idle_timer = None
        if self._executor is None:
            self._executor = (
                ProcessPoolExecutor(max_workers=self._workers)
                if self._kind == "process"
                else ThreadPoolExecutor(max_workers=self._workers, thread_name_prefix="analysis")
            )
        return self._executor

    def _job_done(self) -> None:
        with self._lock:
            self._inflight -= 1
            if self._inflight == 0 and self._executor is not None:
                self._idle_timer = threading.Timer(self._idle_shutdown, self._shutdown_if_idle)
                self._idle_timer.daemon = True
                self._idle_timer.start()

    def _shutdown_if_idle(self) -> None:
        with self._lock:
            if self._inflight or self._executor is None:
                return
            executor, self._executor = self._executor, None
        executor.shutdown(wait=False)
        log.info("analysis workers stopped after %.0fs idle (memory released)", self._idle_shutdown)

    def new_folder(self) -> tuple[str, Path]:
        job_id = str(uuid.uuid4())
        folder = self.work_dir / job_id
        folder.mkdir()
        return job_id, folder

    def discard_folder(self, folder: Path) -> None:
        shutil.rmtree(folder, ignore_errors=True)

    def submit(
        self, job_id: str, folder: Path, upload_path: Path, title: str, filename: str,
        kind: str = "analysis", max_duration: float | None = None,
    ) -> Job:
        self.purge_expired()
        with self._lock:
            active = sum(1 for j in self._jobs.values() if j.status == "processing")
            if active >= self.max_active:
                raise JobQueueFull
            job = Job(job_id, title, filename, folder, upload_path, kind=kind)
            self._jobs[job_id] = job
            self._inflight += 1
            executor = self._get_executor()
        future = executor.submit(
            WORKERS[kind], str(upload_path), str(job.mp3_path), max_duration or self.max_duration
        )
        future.add_done_callback(lambda f: self._finish(job, f))
        return job

    def _finish(self, job: Job, future: Future) -> None:
        try:
            result = future.result()
            job.result, job.status = result, "completed"
        except (AudioDecodeError, AudioTooLongError, RuntimeError) as exc:
            job.error, job.status = str(exc), "failed"
        except Exception:  # noqa: BLE001 - a crashed worker must surface as a failed job
            log.exception("job %s crashed", job.id)
            job.error, job.status = "Analysis failed unexpectedly. Please try again.", "failed"
        finally:
            job.finished_at = time.time()
            job.upload_path.unlink(missing_ok=True)  # only the MP3 is needed from here on
            self._job_done()

    def get(self, job_id: str, kind: str = "analysis") -> Job | None:
        self.purge_expired()
        with self._lock:
            job = self._jobs.get(job_id)
        return job if job and job.kind == kind else None

    def delete(self, job_id: str) -> bool:
        with self._lock:
            job = self._jobs.pop(job_id, None)
        if job:
            # A still-running worker will fail harmlessly when its folder disappears.
            self.discard_folder(job.folder)
        return job is not None

    def purge_expired(self) -> None:
        now = time.time()
        with self._lock:
            expired = [j for j in self._jobs.values() if now - (j.finished_at or j.created_at) > self.ttl]
            for j in expired:
                self._jobs.pop(j.id, None)
        for j in expired:
            self.discard_folder(j.folder)

    def shutdown(self) -> None:
        with self._lock:
            if self._idle_timer:
                self._idle_timer.cancel()
            executor, self._executor = self._executor, None
        if executor:
            executor.shutdown(wait=False, cancel_futures=True)
        shutil.rmtree(self.work_dir, ignore_errors=True)
