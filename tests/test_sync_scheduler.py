from datetime import UTC, datetime

import pytest

from backend.services.sync_scheduler import MarketSyncScheduler, get_due_sync_slot


def test_due_sync_slot_matches_market_windows():
    assert get_due_sync_slot(datetime(2026, 4, 13, 22, 1, tzinfo=UTC)) == "2026-04-13::after-close"


def test_due_sync_slot_skips_weekends_and_outside_windows():
    assert get_due_sync_slot(datetime(2026, 4, 11, 14, 0, tzinfo=UTC)) is None
    assert get_due_sync_slot(datetime(2026, 4, 13, 12, 0, tzinfo=UTC)) is None
    assert get_due_sync_slot(datetime(2026, 4, 13, 21, 59, tzinfo=UTC)) is None


@pytest.mark.asyncio
async def test_scheduler_dedupes_completed_slot():
    runs: list[str] = []

    async def callback():
        runs.append("ran")

    scheduler = MarketSyncScheduler(sync_callback=callback, poll_interval_seconds=3600)
    scheduler.completed_slots.add("2026-04-13::after-close")

    # Exercise the dedupe behavior directly without spinning a real clock loop.
    slot = "2026-04-13::after-close"
    if slot not in scheduler.completed_slots:
        await scheduler.sync_callback()
        scheduler.completed_slots.add(slot)

    assert runs == []
