#!/usr/bin/env python
"""
Load the Smart Grid pipeline outputs straight into MongoDB — the "code -> Atlas"
step that replaces the manual Browse Collections / Import File dance.

Targets the app's own cluster/database: MONGODB_URI / DATABASE_NAME from
frontend/.env.local (see _config.py). Each collection is dropped and reloaded,
so the seed is idempotent.

Run from the backend/ directory:

    uv run scripts/data_pipeline/pipeline.py        # 1. generate outputs/
    uv run scripts/data_pipeline/load_to_mongo.py   # 2. load them here

Each collection is dropped and reloaded, so the seed is idempotent.
"""
import sys
import logging
from pathlib import Path

from bson import json_util

# Make `from db.mdb import ...` resolve regardless of cwd (backend/ is the root).
_BACKEND = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_BACKEND))

from db.mdb import MongoDBConnector                       # noqa: E402
from _timeseries_coll_creator import TimeSeriesCollectionCreator  # noqa: E402
from _config import resolve_target                        # noqa: E402

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
    # Fresh time-series collection. metaField=dataid buckets readings by meter so
    # per-customer queries and the network $lookups stay fast at scale.
    ts = TimeSeriesCollectionCreator(uri=uri, database_name=db)
    ts.get_collection(READINGS_COLLECTION).drop()
    ts.create_timeseries_collection(READINGS_COLLECTION, time_field="timestamp",
                                    granularity="minutes", meta_field="dataid")
    # Fail loudly if it isn't a proper time-series collection — e.g. if a stray
    # writer (a running feeder) auto-created it as a plain collection between the
    # drop and create. A silent plain collection loses metaField bucketing and
    # makes every per-meter query slow.
    info = next((c for c in ts.db.list_collections() if c["name"] == READINGS_COLLECTION), {})
    if info.get("type") != "timeseries":
        raise RuntimeError(
            f"'{READINGS_COLLECTION}' was not created as a time-series collection "
            f"(got {info.get('type')!r}). Stop the feeder before loading, then retry."
        )
    col = ts.get_collection(READINGS_COLLECTION)
    for i in range(0, len(docs), BATCH):
        col.insert_many(docs[i:i + BATCH], ordered=False)
    # Secondary indexes for the network filters that query readings directly.
    for field in ("feeder_id", "state"):
        col.create_index(field)
    logger.info("  %-20s <- %-26s (%d docs, time-series, meta=dataid)", READINGS_COLLECTION, READINGS_FILE.name, len(docs))


def main():
    _require_outputs()
    uri, db = resolve_target()
    logger.info("Seeding database '%s' ...", db)

    connector = MongoDBConnector(uri=uri, database_name=db)
    for path, name in PLAIN_COLLECTIONS.items():
        load_plain(connector, path, name)
    load_readings(uri, db)

    # Record when the dataset was generated so the app can show it for context.
    from datetime import datetime, timezone
    connector.get_collection("demo_meta").replace_one(
        {"_id": "seed"},
        {"_id": "seed", "generatedAt": datetime.now(timezone.utc)},
        upsert=True,
    )

    logger.info("Done.")


if __name__ == "__main__":
    main()
