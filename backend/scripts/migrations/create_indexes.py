#!/usr/bin/env python
"""
One-shot migration: create compound secondary indexes on the readings
time-series collection to support production query patterns.

Idempotent — safe to run multiple times; existing indexes are skipped.

    cd backend
    uv run scripts/migrations/create_indexes.py
"""
import sys
from pathlib import Path

# Allow imports from the data_pipeline package (sibling directory).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "data_pipeline"))

from _config import resolve_target  # noqa: E402

# Re-use the creator class from the repo root backend package.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from _timeseries_coll_creator import TimeSeriesCollectionCreator  # noqa: E402


def main():
    uri, dbname = resolve_target()
    creator = TimeSeriesCollectionCreator(uri=uri, database_name=dbname)
    creator.ensure_secondary_indexes("readings")
    print("Done — indexes ensured on 'readings'.")


if __name__ == "__main__":
    main()
