#!/usr/bin/env python
"""
Sanity-check the seeded data on the SEED_* (test) cluster. Run after load_to_mongo.py:

    cd backend
    uv run scripts/data_pipeline/check_seed.py

Every line prints its expectation; anything off is easy to spot.
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

_BACKEND = Path(__file__).resolve().parents[2]
load_dotenv(_BACKEND / ".env")

uri, dbname = os.getenv("SEED_MONGODB_URI"), os.getenv("SEED_DATABASE_NAME")
if not uri or not dbname:
    sys.exit("Set SEED_MONGODB_URI and SEED_DATABASE_NAME in backend/.env")

db = MongoClient(uri)[dbname]
R = db["readings"]

print(f"Checking '{dbname}'\n")

print("1) COUNTS")
for n in ["readings", "customer_db", "meter_network_map", "network", "tariff_catalog"]:
    print(f"   {n:20s} {db[n].count_documents({}):,}")

print("\n2) COVERAGE (readings per customer should all be equal)")
per = list(R.aggregate([{"$group": {"_id": "$dataid", "c": {"$sum": 1}}}]))
counts = [d["c"] for d in per]
print(f"   distinct customers : {len(per)}")
print(f"   readings/customer  : min={min(counts)} max={max(counts)}")

print("\n3) TIME RANGE & CADENCE")
lo = R.find_one(sort=[("timestamp", 1)])["timestamp"]
hi = R.find_one(sort=[("timestamp", -1)])["timestamp"]
ts = sorted(x["timestamp"] for x in R.find({"dataid": per[0]["_id"]}, {"timestamp": 1}))
print(f"   first {lo}  last {hi}  span {hi - lo}")
print(f"   typical gap : {ts[1] - ts[0]} (expected 0:15:00)")

print("\n4) JOIN INTEGRITY")
s = per[0]["_id"]
print(f"   dataid {s}: customer_db={db['customer_db'].count_documents({'dataid': s})}, "
      f"map={db['meter_network_map'].count_documents({'dataid': s})} (expected 1 each)")

print("\n5) GRID STRESS EVENTS")
print(f"   readings tagged : {R.count_documents({'grid_event_id': {'$exists': True}})}")
print(f"   labels          : {R.distinct('grid_event_label')}")

print("\n6) PHYSICAL SANITY (expected 0 / 0)")
bad = R.count_documents({"$expr": {"$gt": [{"$abs": {"$subtract": [
    {"$add": ["$hvac_power", "$heating_power", "$kitchen_power",
              "$laundry_power", "$ev_power", "$env_power"]}, "$power"]}}, 0.01]}})
ev_bad = R.count_documents({"ev_power": {"$gt": 0}, "has_ev": False})
print(f"   channels != power   : {bad}")
print(f"   ev_power w/o has_ev : {ev_bad}")
