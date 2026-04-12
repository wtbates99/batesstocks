from __future__ import annotations

from dataclasses import dataclass, replace
from datetime import UTC, datetime
from threading import Lock


def _utc_now() -> str:
    return datetime.now(UTC).isoformat()


@dataclass(frozen=True)
class SyncStatusSnapshot:
    state: str = "idle"
    source: str = "system"
    phase: str = "waiting"
    detail: str = "No sync activity yet."
    started_at: str | None = None
    updated_at: str | None = None
    finished_at: str | None = None
    target_tickers: int = 0
    completed_tickers: int = 0
    rows_written: int = 0
    metadata_rows: int = 0
    last_success_at: str | None = None
    last_error: str | None = None


class SyncStatusTracker:
    def __init__(self) -> None:
        self._lock = Lock()
        self._snapshot = SyncStatusSnapshot(updated_at=_utc_now())

    def get(self) -> SyncStatusSnapshot:
        with self._lock:
            return self._snapshot

    def begin(self, source: str, target_tickers: int, detail: str) -> None:
        now = _utc_now()
        with self._lock:
            self._snapshot = SyncStatusSnapshot(
                state="running",
                source=source,
                phase="downloading",
                detail=detail,
                started_at=now,
                updated_at=now,
                target_tickers=target_tickers,
                completed_tickers=0,
                rows_written=0,
                metadata_rows=0,
                last_success_at=self._snapshot.last_success_at,
            )

    def update(
        self,
        *,
        phase: str,
        detail: str,
        completed_tickers: int | None = None,
        rows_written: int | None = None,
        metadata_rows: int | None = None,
    ) -> None:
        now = _utc_now()
        with self._lock:
            self._snapshot = replace(
                self._snapshot,
                phase=phase,
                detail=detail,
                updated_at=now,
                completed_tickers=self._snapshot.completed_tickers
                if completed_tickers is None
                else completed_tickers,
                rows_written=self._snapshot.rows_written if rows_written is None else rows_written,
                metadata_rows=self._snapshot.metadata_rows
                if metadata_rows is None
                else metadata_rows,
            )

    def succeed(self, *, rows_written: int, metadata_rows: int, detail: str) -> None:
        now = _utc_now()
        with self._lock:
            self._snapshot = replace(
                self._snapshot,
                state="idle",
                phase="complete",
                detail=detail,
                updated_at=now,
                finished_at=now,
                rows_written=rows_written,
                metadata_rows=metadata_rows,
                completed_tickers=self._snapshot.target_tickers,
                last_success_at=now,
                last_error=None,
            )

    def fail(self, message: str) -> None:
        now = _utc_now()
        with self._lock:
            self._snapshot = replace(
                self._snapshot,
                state="error",
                phase="failed",
                detail="Sync failed.",
                updated_at=now,
                finished_at=now,
                last_error=message,
            )


sync_status_tracker = SyncStatusTracker()
