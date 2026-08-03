#!/usr/bin/env python
"""
Load the Smart Grid pipeline outputs straight into MongoDB — the "code -> Atlas"
step that replaces the manual Browse Collections / Import File dance.

SAFETY: this loads into a SEPARATE cluster/database defined by its own env vars,
so it never touches the demo's runtime cluster (MONGODB_URI / DATABASE_NAME):

    SEED_MONGODB_URI    connection string of the *test* cluster
    SEED_DATABASE_NAME  database to (re)create there

Run from the backend/ directory:

    uv run scripts/data_pipeline/pipeline.py        # 1. generate outputs/
    uv run scripts/data_pipeline/load_to_mongo.py   # 2. load them here

Each collection is dropped and reloaded, so the seed is idempotent.
"""
import os
import sys
import logging
from pathlib import Path

from bson import json_util
from dotenv import load_dotenv

# Make `from db.mdb import ...` resolve regardless of cwd (backend/ is the root).
_BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_BACKEND))

from db.mdb import MongoDBConnector                       # noqa: E402
from _timeseries_coll_creator import TimeSeriesCollectionCreator  # noqa: E402

load_dotenv(_BACKEND / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("seed")

_HERE = Path(__file__).resolve().parent
INPUTS = _HERE / "inputs"
OUTPUTS = _HERE / "outputs"

# file -> collection. Readings are handled separately (time-series).
PLAIN_COLLECTIONS = {
    OUTPUTS / "network_map.json": "meter_network_map",
    OUTPUTS / "customers_expanded.json": "customer_db",
    INPUTS / "network.json": "network",  # canonical topology, seeded as-is
    INPUTS / "tariff_catalog.json": "tariff_catalog",  # static tariffs, seeded as-is
}
READINGS_FILE = OUTPUTS / "readings_final.json"
READINGS_COLLECTION = "readings"
BATCH = 5000


def _load_json(path: Path):
    """Parse a JSON array, honoring EJSON tags like {"$date": ...} so timestamps
    land as real BSON dates rather than strings."""
    with open(path) as f:
        return json_util.loads(f.read())


def _require_outputs():
    missing = [p.name for p in [READINGS_FILE, *PLAIN_COLLECTIONS] if not p.exists()]
    if missing:
        logger.error("Missing pipeline outputs: %s", ", ".join(missing))
        logger.error("Run `uv run scripts/data_pipeline/pipeline.py` first.")
        sys.exit(1)


def _assert_test_env():
    uri = os.getenv("SEED_MONGODB_URI")
    db = os.getenv("SEED_DATABASE_NAME")
    if not uri or not db:
        logger.error("Set SEED_MONGODB_URI and SEED_DATABASE_NAME in backend/.env "
                     "(a separate TEST cluster — never the runtime one).")
        sys.exit(1)
    # Guardrail: refuse to seed if pointed at the runtime cluster/database.
    if uri == os.getenv("MONGODB_URI") and db == os.getenv("DATABASE_NAME"):
        logger.error("SEED_* points at the runtime cluster/database. Use a separate "
                     "test cluster so the current demo can't break.")
        sys.exit(1)
    return uri, db


def load_plain(connector: MongoDBConnector, path: Path, name: str):
    docs = _load_json(path)
    col = connector.get_collection(name)
    col.drop()
    if docs:
        for i in range(0, len(docs), BATCH):
            col.insert_many(docs[i:i + BATCH], ordered=False)
    logger.info("  %-20s <- %-26s (%d docs)", name, path.name, len(docs))


def load_readings(uri: str, db: str):
    docs = _load_json(READINGS_FILE)
    # Fresh time-series collection (timeField=timestamp, 15-min cadence).
    ts = TimeSeriesCollectionCreator(uri=uri, database_name=db)
    ts.get_collection(READINGS_COLLECTION).drop()
    ts.create_timeseries_collection(READINGS_COLLECTION, time_field="timestamp", granularity="minutes")
    col = ts.get_collection(READINGS_COLLECTION)
    for i in range(0, len(docs), BATCH):
        col.insert_many(docs[i:i + BATCH], ordered=False)
    logger.info("  %-20s <- %-26s (%d docs, time-series)", READINGS_COLLECTION, READINGS_FILE.name, len(docs))


def main():
    _require_outputs()
    uri, db = _assert_test_env()
    logger.info("Seeding database '%s' on the test cluster ...", db)

    connector = MongoDBConnector(uri=uri, database_name=db)
    for path, name in PLAIN_COLLECTIONS.items():
        load_plain(connector, path, name)
    load_readings(uri, db)

    logger.info("Done.")


if __name__ == "__main__":
    main()
