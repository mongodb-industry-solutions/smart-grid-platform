#!/usr/bin/env python
"""
One-shot migration: set a TTL (expireAfterSeconds) on the readings
time-series collection so MongoDB automatically prunes old documents.

For existing collections, uses collMod (create_collection only accepts
expireAfterSeconds at creation time). Idempotent — running again just
re-applies the same value.

    cd backend
    uv run scripts/migrations/set_ttl.py
    uv run scripts/migrations/set_ttl.py --days 60   # custom retention
"""
import sys
import argparse
from pathlib import Path

# Allow imports from the data_pipeline package (sibling directory).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "data_pipeline"))

from _config import resolve_target  # noqa: E402
from pymongo import MongoClient  # noqa: E402

import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DEFAULT_RETENTION_DAYS = 90


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--days", type=int, default=DEFAULT_RETENTION_DAYS,
                    help=f"retention period in days (default {DEFAULT_RETENTION_DAYS})")
    args = ap.parse_args()

    uri, dbname = resolve_target()
    db = MongoClient(uri)[dbname]

    expire_seconds = args.days * 86400
    result = db.command("collMod", "readings", expireAfterSeconds=expire_seconds)
    logger.info("Set expireAfterSeconds=%d (%d days) on 'readings': %s",
                expire_seconds, args.days, result)
    print(f"Done — readings TTL set to {args.days} days.")


if __name__ == "__main__":
    main()
