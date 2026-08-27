#!/usr/bin/env python
"""
Rollup worker: periodically pre-computes dashboard aggregations into
rollup collections so the frontend reads cheap single-doc lookups
instead of running heavy pipelines on every poll.

    cd backend
    uv run scripts/data_pipeline/rollup_worker.py
    uv run scripts/data_pipeline/rollup_worker.py --interval 30  # every 30s
"""
import sys
import time
import signal
import argparse
import logging
from datetime import datetime, timezone

from pymongo import MongoClient

from _config import resolve_target

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("rollup_worker")

READINGS = "readings"
CUSTOMERS = "customer_db"

OUTAGE_INTERVAL_MS = 15 * 60 * 1000


def refresh_latest_readings(db):
    """One doc per meter with latest reading fields -> rollup_latest_readings."""
    db[READINGS].aggregate([
        {"$sort": {"dataid": 1, "timestamp": -1}},
        {"$group": {
            "_id": "$dataid",
            "timestamp": {"$first": "$timestamp"},
            "energy": {"$first": "$energy"},
            "power": {"$first": "$power"},
            "voltage": {"$first": "$voltage"},
            "current": {"$first": "$current"},
            "power_factor": {"$first": "$power_factor"},
        }},
        {"$set": {"refreshed_at": datetime.now(timezone.utc)}},
        {"$merge": {
            "into": "rollup_latest_readings",
            "on": "_id",
            "whenMatched": "replace",
            "whenNotMatched": "insert",
        }},
    ]).close()


def refresh_outage_summary(db):
    """Single summary doc -> rollup_outage_summary."""
    total_outages = db[READINGS].count_documents({"power": {"$lte": 0}})

    outage_meters = db[READINGS].distinct("dataid", {"power": {"$lte": 0}})
    customer_dataids = {
        doc["dataid"]
        for doc in db[CUSTOMERS].find({}, {"dataid": 1, "_id": 0})
    }
    customers_with_outage = len(set(outage_meters) & customer_dataids)
    total_customers = db[CUSTOMERS].count_documents({})

    # Longest outage via gaps-and-islands.
    longest_docs = list(db[READINGS].aggregate([
        {"$match": {"power": {"$lte": 0}}},
        {"$sort": {"dataid": 1, "timestamp": 1}},
        {"$setWindowFields": {
            "partitionBy": "$dataid",
            "sortBy": {"timestamp": 1},
            "output": {
                "prevTimestamp": {"$shift": {"output": "$timestamp", "by": -1}},
            },
        }},
        {"$set": {"isNewSession": {"$cond": [
            {"$or": [
                {"$eq": ["$prevTimestamp", None]},
                {"$gt": [{"$subtract": ["$timestamp", "$prevTimestamp"]}, OUTAGE_INTERVAL_MS]},
            ]},
            1, 0,
        ]}}},
        {"$setWindowFields": {
            "partitionBy": "$dataid",
            "sortBy": {"timestamp": 1},
            "output": {
                "sessionId": {
                    "$sum": "$isNewSession",
                    "window": {"documents": ["unbounded", "current"]},
                },
            },
        }},
        {"$group": {
            "_id": {"dataid": "$dataid", "sessionId": "$sessionId"},
            "start": {"$min": "$timestamp"},
            "end": {"$max": "$timestamp"},
        }},
        {"$set": {"durationMs": {"$add": [
            {"$subtract": ["$end", "$start"]},
            OUTAGE_INTERVAL_MS,
        ]}}},
        {"$sort": {"durationMs": -1}},
        {"$limit": 1},
    ]))

    longest = None
    if longest_docs:
        doc = longest_docs[0]
        longest = {
            "meterId": doc["_id"]["dataid"],
            "durationMs": doc["durationMs"],
            "start": doc["start"],
            "end": doc["end"],
        }

    pct = (customers_with_outage / total_customers * 100) if total_customers else 0

    db["rollup_outage_summary"].replace_one(
        {"_id": "summary"},
        {
            "_id": "summary",
            "totalOutages": total_outages,
            "customersWithOutage": customers_with_outage,
            "totalCustomers": total_customers,
            "pctCustomersWithOutage": pct,
            "longestOutage": longest,
            "refreshed_at": datetime.now(timezone.utc),
        },
        upsert=True,
    )


def refresh_demand_hourly(db):
    """Hourly demand by region -> rollup_demand_hourly."""
    db[READINGS].aggregate([
        {"$match": {"state": {"$ne": None}}},
        {"$group": {
            "_id": {"region": "$state", "hour": {"$hour": "$timestamp"}},
            "expected_kw": {"$avg": "$avg_reading"},
            "std_dev": {"$stdDevSamp": "$avg_reading"},
            "samples": {"$sum": 1},
        }},
        {"$set": {"refreshed_at": datetime.now(timezone.utc)}},
        {"$merge": {
            "into": "rollup_demand_hourly",
            "on": "_id",
            "whenMatched": "replace",
            "whenNotMatched": "insert",
        }},
    ]).close()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--interval", type=float, default=10.0,
                    help="seconds between refresh cycles (default 10)")
    ap.add_argument("--max-hours", type=float, default=12.0,
                    help="auto-stop after this many hours (default 12; 0 disables)")
    args = ap.parse_args()

    uri, dbname = resolve_target()
    db = MongoClient(uri)[dbname]

    running = {"go": True}
    signal.signal(signal.SIGINT, lambda *_: running.update(go=False))
    deadline = time.monotonic() + args.max_hours * 3600 if args.max_hours else None

    logger.info("Rollup worker started (interval=%.0fs, max_hours=%.0f)",
                args.interval, args.max_hours or 0)

    cycles = 0
    while running["go"]:
        t0 = time.monotonic()
        try:
            refresh_latest_readings(db)
            refresh_outage_summary(db)
            refresh_demand_hourly(db)
            cycles += 1
            if cycles % 6 == 0:
                logger.info("Completed %d refresh cycles", cycles)
        except Exception as e:
            logger.error("Rollup cycle failed: %s", e)

        if deadline and time.monotonic() >= deadline:
            logger.info("Reached max-hours limit; stopping.")
            break

        elapsed = time.monotonic() - t0
        time.sleep(max(0.0, args.interval - elapsed))

    logger.info("Stopped after %d cycles.", cycles)


if __name__ == "__main__":
    main()
