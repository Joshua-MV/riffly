"""Background analysis queue.

v1 runs analyses in a local process pool so CPU-heavy DSP never blocks the API event loop.
Jobs are not durable: on startup, anything left ``queued``/``processing`` is marked failed
with a retry hint. For horizontal scale, replace this module with a Redis-backed queue
(arq / Celery / RQ) and run the same ``run_analysis`` function in dedicated workers.
"""

from __future__ import annotations

import logging
from concurrent.futures import Executor, Future, ProcessPoolExecutor, ThreadPoolExecutor
from pathlib import Path

from .audio.pipeline import AudioDecodeError, AudioTooLongError, analyze_file
from .repository.base import Repository

log = logging.getLogger(__name__)


def run_analysis(audio_path: str, max_duration: float) -> dict:
    """Top-level (picklable) job entry point."""
    return analyze_file(Path(audio_path), max_duration=max_duration).to_dict()


class AnalysisQueue:
    def __init__(self, repo: Repository, workers: int, kind: str, max_duration: float) -> None:
        self.repo = repo
        self.max_duration = max_duration
        self.executor: Executor = (
            ProcessPoolExecutor(max_workers=workers)
            if kind == "process"
            else ThreadPoolExecutor(max_workers=workers, thread_name_prefix="analysis")
        )

    def enqueue(self, song_id: str, audio_path: str) -> str:
        analysis = self.repo.create_analysis(song_id, "queued")
        # The status flips to "processing" as soon as a worker picks the job up; with a
        # process pool we can't observe that directly, so we mark it on submission.
        self.repo.update_analysis(analysis.id, "processing")
        future = self.executor.submit(run_analysis, audio_path, self.max_duration)
        future.add_done_callback(lambda f: self._finish(analysis.id, f))
        return analysis.id

    def _finish(self, analysis_id: str, future: Future) -> None:
        try:
            result = future.result()
        except (AudioDecodeError, AudioTooLongError) as exc:
            self.repo.update_analysis(analysis_id, "failed", error=str(exc))
            return
        except Exception:  # noqa: BLE001 - any worker crash must surface as a failed job
            log.exception("analysis %s crashed", analysis_id)
            self.repo.update_analysis(
                analysis_id, "failed", error="Analysis failed unexpectedly. Please try again."
            )
            return
        self.repo.update_analysis(analysis_id, "completed", result=result)

    def shutdown(self) -> None:
        self.executor.shutdown(wait=False, cancel_futures=True)
