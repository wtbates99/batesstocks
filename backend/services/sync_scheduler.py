from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

MARKET_TZ = ZoneInfo("America/New_York")
SCHEDULED_SLOTS: tuple[tuple[str, time], ...] = (
    ("open", time(9, 35)),
    ("hourly-10", time(10, 30)),
    ("hourly-11", time(11, 30)),
    ("hourly-12", time(12, 30)),
    ("hourly-13", time(13, 30)),
    ("hourly-14", time(14, 30)),
    ("hourly-15", time(15, 30)),
    ("close", time(16, 10)),
)
SLOT_WINDOW = timedelta(minutes=20)

logger = logging.getLogger("batesstocks.scheduler")


def _to_market_time(current_time: datetime) -> datetime:
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=UTC)
    return current_time.astimezone(MARKET_TZ)


def get_due_sync_slot(current_time: datetime) -> str | None:
    market_now = _to_market_time(current_time)
    if market_now.weekday() >= 5:
        return None

    for slot_name, slot_time in SCHEDULED_SLOTS:
        slot_start = datetime.combine(
            market_now.date(),
            slot_time,
            tzinfo=MARKET_TZ,
        )
        slot_end = slot_start + SLOT_WINDOW
        if slot_start <= market_now < slot_end:
            return f"{market_now.date().isoformat()}::{slot_name}"
    return None


@dataclass
class MarketSyncScheduler:
    sync_callback: Callable[[], Awaitable[None]]
    poll_interval_seconds: float = 300.0
    completed_slots: set[str] = field(default_factory=set)
    _task: asyncio.Task[None] | None = field(default=None, init=False)
    _running: bool = field(default=False, init=False)

    async def _run(self) -> None:
        while self._running:
            slot = get_due_sync_slot(datetime.now(UTC))
            if slot and slot not in self.completed_slots:
                logger.info("Running scheduled market sync for slot %s", slot)
                try:
                    await self.sync_callback()
                    self.completed_slots.add(slot)
                except Exception as exc:  # pragma: no cover - network/provider dependent
                    logger.warning("Scheduled market sync failed for %s: %s", slot, exc)
            await asyncio.sleep(self.poll_interval_seconds)

    def start(self) -> None:
        if self._task is not None:
            return
        self._running = True
        self._task = asyncio.create_task(self._run())

    async def stop(self) -> None:
        self._running = False
        if self._task is None:
            return
        self._task.cancel()
        try:
            await self._task
        except asyncio.CancelledError:
            pass
        self._task = None
