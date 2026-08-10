# Raspberry Pi Performance Plan

## Target

BatesStocks should behave like a local terminal even though the Pi is modest hardware.
The serving path therefore has hard boundaries:

- cached security chart: p95 under 500 ms on the Pi, warm p95 under 200 ms
- route shell visible from a warm browser cache in under 1 second
- no market-provider request, indicator calculation, or database rewrite in a chart request
- six months available in the first chart response; one and two years fetched only when selected
- daily ingestion must yield between ticker writes and must not rebuild whole-table indexes

The browser's live quote request remains separate from historical charts. A delayed quote
provider must never hold the chart hostage.

## Measured bottleneck and current correction

The old security page requested 3,000 daily bars for every symbol. The API converted that
limit to a twelve-year history requirement and synchronously called yfinance when the local
database did not satisfy it. A user looking at a one-month chart could consequently wait for
a twelve-year download, indicator computation, DuckDB rewrite, and index rebuild.

The optimized path now:

1. serves security reads exclusively from DuckDB;
2. loads 132 bars initially and caps selectable history at 504 trading days;
3. uses SMA 10/30/50 overlays instead of sending a chart-length SMA 200 series;
4. selects only fields consumed by the chart;
5. compresses API responses and caches immutable Vite assets;
6. retains six-month queries for 30 minutes in the browser and five minutes in the process;
7. filters peer ranking before running windows instead of ranking the full database.
8. materializes the latest row for each symbol at startup/sync, so dashboard, monitor,
   sector, and security snapshots scan about 550 rows instead of 707,000 historical rows.
9. gives each read request an independent DuckDB cursor while retaining a serialized writer,
   eliminating the global read lock that queued simultaneous cold symbols.

Using the 707,532-row development database, payload sizes changed as follows:

| Chart range | Before | Optimized JSON | Optimized gzip |
| --- | ---: | ---: | ---: |
| Initial chart | 514 KiB | 37 KiB (six-month cache) | 11 KiB |
| One year | 514 KiB | 69 KiB | 19 KiB |
| Two years | 514 KiB | 137 KiB | 37 KiB |

The initial visible one-month subset is sliced from the resident six-month response, so 1M,
3M, and 6M switches do not touch the network. Switching to 1Y or 2Y keeps the current chart
on screen while the bounded range loads.

Terminal-wide query timings on the same database improved as follows (warm local runs):

| Query | Before | Optimized |
| --- | ---: | ---: |
| Dashboard overview | 184 ms | 10 ms |
| Market monitor | 237 ms | 8 ms |
| Sector overview | repeated full-history scan | 3 ms |
| Four-symbol snapshot | 13 ms | 2 ms |
| Security response assembly | 55 ms | 13 ms |

Refreshing the 557-row serving snapshot from all 707,532 historical rows adds about 230 ms
to process startup. Incremental sync refreshes only the symbols it changed.

## Data pipeline

Historical data is prepared work, not request-time work.

- A single-instance Pi deployment may enable `AUTO_SYNC_SCHEDULED=true`; it runs once after
  the market close and performs an incremental update.
- Scheduled refreshes reuse existing slow-moving company metadata and fetch metadata only
  for new symbols.
- Pandas frames are grouped once before the ticker write loop rather than rescanned once per
  ticker.
- Serving indexes stay online during incremental writes. The sync no longer drops and
  rebuilds the entire index for a small daily delta.
- Keep one Uvicorn worker. Multiple processes cannot safely share the current DuckDB writer,
  and extra workers waste Pi memory. Scale reads by improving the local serving tables before
  adding processes.

## Pi sizing

Start with these conservative settings and adjust from observed headroom:

| Pi memory | `DUCKDB_MEMORY_LIMIT` | `DUCKDB_THREADS` | Notes |
| --- | ---: | ---: | --- |
| 2 GB | 384MB | 2 | Prefer a reduced universe; avoid full bootstrap while serving |
| 4 GB | 768MB | 2 | Recommended Pi 4 baseline |
| 8 GB | 1536MB | 3 | More sync headroom; serving gains beyond 3 threads are small |

The image pins BLAS/OpenMP helpers to one thread and limits glibc allocation arenas so NumPy
does not oversubscribe four small cores or retain unnecessary heaps. Docker logs rotate at
30 MB maximum, and `init: true` gives clean signal handling.

### Measured production host (2026-08-10)

The live host is a Raspberry Pi 4 Model B Rev 1.5 with four Cortex-A72 cores at 1.8 GHz and
3.7 GiB usable memory. Its database resides on a 119.5 GB USB-attached ext4 volume rather
than the SD card. At baseline it had 2.5 GiB available memory, 43.8°C temperature, no current
or historical throttling (`get_throttled=0x0`), and negligible load.

The old BatesStocks container was limited to one CPU and 768 MiB RAM while DuckDB itself was
also allowed 768 MiB, leaving no explicit headroom for Python/Pandas. It consumed 498 MiB at
idle and had generated 2.07 GB of block writes in 18 hours. The production allocation is
therefore 1.25 GiB / two CPUs for BatesStocks, with DuckDB retained at 768 MiB, and 1 GiB /
two CPUs for the separately heavy BatesMLB web process. Their maintenance jobs run roughly
twelve hours apart, so these burst allowances do not reserve memory or normally peak at the
same time.

Untouched production endpoint baseline:

| Endpoint | Cold | Warm | Wire size |
| --- | ---: | ---: | ---: |
| Security, 132 bars | 12.15 s | 40 ms | 70.8 KiB |
| Security, 504 bars | 1.89 s | 111 ms | 265.9 KiB |
| Security, 3,000 bars | 12.31 s | — | 1.57 MiB |
| Workspace | 6.71 s | 51 ms | 4.0 KiB |
| Monitor | 8.27 s | 34 ms | 29.6 KiB |

The multi-second cold times confirm that request-time hydration and repeated historical
windows—not the chart renderer—were the dominant bottleneck.

## Deployment

CI publishes a native ARM64 image. On the Pi, deployment does not need to compile Node or
Python dependencies:

```bash
export APP_IMAGE=ghcr.io/wtbates99/batesstocks:latest
export AUTO_SYNC_SCHEDULED=true
export DUCKDB_MEMORY_LIMIT=768MB
export DUCKDB_THREADS=2
docker compose pull app
docker compose up -d --no-build app
docker compose ps
```

Keep `data/` and `backups/` on persistent storage. Do not put the DuckDB file on an NFS/SMB
mount. Deploy by digest or `sha-*` tag when rollback reproducibility matters; return to the
previous tag and run `docker compose up -d --no-build app` to roll back the application while
preserving data.

## Production verification

Run this after deploy and after the scheduled sync. Test a cold symbol first, then repeat it
to capture warm-cache behavior:

```bash
curl -sS -o /dev/null -w 'status=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s bytes=%{size_download}\n' \
  --compressed 'http://127.0.0.1:8000/terminal/security/AAPL?limit=132'
curl -sS -o /dev/null -w 'status=%{http_code} ttfb=%{time_starttransfer}s total=%{time_total}s bytes=%{size_download}\n' \
  --compressed 'http://127.0.0.1:8000/terminal/security/AAPL?limit=504'
docker stats --no-stream
```

Also record `vcgencmd get_throttled`, storage latency, container RSS, and the sync duration.
If the warm 132-bar endpoint misses 200 ms, profile DuckDB peer ranking and storage before
raising thread or memory limits. If only cold requests miss, retain/prewarm the most-used
symbols rather than adding workers.

## Next optimization gates

Proceed in evidence order:

1. Validate the endpoint SLO and browser waterfall on the actual Pi.
2. Move provider sync to a separately scheduled maintenance window only if background CPU or
   storage contention causes serving SLO misses.
3. Add a small prioritized universe only if a full two-year, ~550-symbol refresh exceeds the
   Pi's memory or daily maintenance window.
4. Add server timing and p50/p95 telemetry before attempting Redis or a multi-service stack.

Redis, extra Uvicorn workers, and client-side downsampling are intentionally not first-line
changes: at 504 points they add operational complexity without addressing the former
twelve-year request-time backfill.
