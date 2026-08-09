"""Run one bounded market-data update and publish one latest export."""

from __future__ import annotations

import os
import shutil

from backend.core.config import get_backup_dir, get_db_path
from backend.services.data_sync_service import sync_market_data


def main() -> None:
    years = int(os.getenv("SYNC_YEARS", "2"))
    sync_market_data(None, years, "scheduled")

    database = get_db_path()
    export_dir = get_backup_dir()
    export_dir.mkdir(parents=True, exist_ok=True)
    temporary = export_dir / ".batesstocks.duckdb.tmp"
    destination = export_dir / "batesstocks.duckdb"
    shutil.copy2(database, temporary)
    temporary.replace(destination)
    print(f"Published latest export: {destination}")


if __name__ == "__main__":
    main()
