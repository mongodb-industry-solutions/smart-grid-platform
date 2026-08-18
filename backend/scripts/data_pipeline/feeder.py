#!/usr/bin/env python
"""
Live feeder: appends one fresh reading per customer every tick, at the real wall
clock, so the demo streams "real-time" data on top of the seeded history.

    cd backend
    uv run scripts/data_pipeline/feeder.py             # accelerated replay: +15 sim-min every ~3s
    uv run scripts/data_pipeline/feeder.py --tick 900  # true real-time (a new interval every 15 min)

Reads the app's config (MONGODB_URI / DATABASE_NAME from frontend/.env.local) and
appends to the same collections the pipeline seeds. Each tick advances every
customer's cumulative energy register by power * dt, so consumption derived from
consecutive-reading differences stays correct at ANY cadence (the frontend derives
kW from the real dt, not a fixed 15-min assumption).

Stop with Ctrl+C.
"""
import sys
import time
import signal
import argparse
import logging
from datetime import datetime, timezone, timedelta

import numpy as np
from pymongo import MongoClient

from _config import resolve_target

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("feeder")

READINGS = "readings"
MAP = "meter_network_map"
# Grid hierarchy + region denormalized onto each live reading (matches the
# pipeline), so demand/forecast run without a $lookup back into meter_network_map.
NET_FIELDS = ["utility_id", "substation_id", "feeder_id", "transformer_id", "state", "city"]


def _rand(rng, lo, hi, nd=3):
    return round(float(rng.uniform(lo, hi)), nd)


def customer_profile(dataid):
    """Stable per-customer profile (same shares every run) seeded by dataid."""
    rng = np.random.default_rng(dataid)
    return {"hvac_share": _rand(rng, 0.25, 0.5), "heat_share": _rand(rng, 0.05, 0.25)}


def split_power(total_power, prof, hour, has_ev, rng):
    """Break total power into appliance channels that sum EXACTLY to power
    (mirrors the pipeline's synthesis so live docs match historical ones)."""
    hvac = max(0.0, total_power * prof["hvac_share"] * (0.6 + 0.8 * np.sin((hour / 24) * np.pi)))
    heating = max(0.0, total_power * prof["heat_share"] * (1.3 if hour < 7 or hour > 20 else 0.6))
    kitchen = max(0.0, total_power * _rand(rng, 0.05, 0.15) * (2.0 if hour in (7, 8, 12, 18, 19) else 0.4))
    laundry = max(0.0, total_power * _rand(rng, 0.03, 0.10) * (1.8 if 18 <= hour <= 22 else 0.3))
    ev = _rand(rng, 1500, 7000) if (has_ev and (hour >= 22 or hour <= 5) and rng.random() < 0.6) else 0.0
    hvac, heating, kitchen, laundry, ev = (round(x, 3) for x in (hvac, heating, kitchen, laundry, ev))
    grand = round(total_power + ev, 3)
    env = round(grand - (hvac + heating + kitchen + laundry + ev), 3)
    if env < 0:
        grand = round(grand - env, 3); env = 0.0
    return {"hvac_power": hvac, "heating_power": heating, "kitchen_power": kitchen,
            "laundry_power": laundry, "ev_power": ev, "env_power": env, "power": grand}


def load_state(db):
    """Seed the feeder's in-memory state from the latest reading per customer
    (cumulative energy, has_ev) joined with the meter->grid map (network ids)."""
    net = {m["dataid"]: {k: m.get(k) for k in NET_FIELDS} for m in db[MAP].find({}, {"_id": 0})}
    latest = db[READINGS].aggregate([
        {"$sort": {"timestamp": -1}},
        {"$group": {"_id": "$dataid",
                    "energy": {"$first": "$energy"},
                    "has_ev": {"$first": "$has_ev"}}},
    ])
    state = {}
    for row in latest:
        did = row["_id"]
        if did not in net:
            continue
        state[did] = {"energy": float(row.get("energy") or 0.0),
                      "has_ev": bool(row.get("has_ev")),
                      "profile": customer_profile(did),
                      "net": net[did]}
    return state


def make_reading(did, st, ts, dt_hours, rng):
    v1 = _rand(rng, 118, 125); v2 = _rand(rng, 118, 125); avg = round((v1 + v2) / 2, 3)
    amps = _rand(rng, 0.5, 30.0); pf = _rand(rng, 0.85, 0.99); freq = _rand(rng, 59.95, 60.05)
    total_power = round(avg * amps * pf, 3)
    ch = split_power(total_power, st["profile"], ts.hour, st["has_ev"], rng)
    interval_kwh = round((ch["power"] / 1000) * dt_hours, 6)  # consumption this interval
    st["energy"] = round(st["energy"] + interval_kwh, 6)  # cumulative kWh
    doc = {"avg_reading": avg, "current": amps, "dataid": int(did), "energy": st["energy"],
           "interval_kwh": interval_kwh,
           "env_power": ch["env_power"], "ev_power": ch["ev_power"], "frequency": freq,
           "has_ev": st["has_ev"], "heating_power": ch["heating_power"], "hvac_power": ch["hvac_power"],
           "kitchen_power": ch["kitchen_power"], "laundry_power": ch["laundry_power"], "power": ch["power"],
           "power_factor": pf, "timestamp": ts, "volt_leg_1": v1, "volt_leg_2": v2, "voltage": avg}
    doc.update(st["net"])
    return doc


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--tick", type=float, default=3.0,
                    help="real seconds between inserts (default 3 — visible movement)")
    ap.add_argument("--interval-minutes", type=float, default=15.0,
                    help="simulated minutes each tick advances (default 15 = native cadence). "
                         "Accelerated replay: tick 3 + interval 15. True real-time: tick 900 + interval 15.")
    # Safety limits so the feeder can never overflow the collection or run forever:
    ap.add_argument("--retain-days", type=float, default=7.0,
                    help="prune readings older than this many simulated days each tick "
                         "(default 7 — keeps the collection bounded near the seed window; "
                         "keep in sync with pipeline.py DURATION, currently 6d; 0 disables)")
    ap.add_argument("--max-hours", type=float, default=2.0,
                    help="auto-stop after this many real hours so an orphaned feeder can't "
                         "run indefinitely (default 2; 0 disables)")
    args = ap.parse_args()

    uri, dbname = resolve_target()

    db = MongoClient(uri)[dbname]
    col = db[READINGS]
    state = load_state(db)
    if not state:
        sys.exit("No seeded readings found — run pipeline.py + load_to_mongo.py first.")

    # Continue the simulation clock from the newest existing reading, keeping the
    # native cadence so every stored reading stays evenly spaced (nothing in the
    # 15-min-oriented frontend breaks). The wall clock only paces the inserts.
    last = col.find_one(sort=[("timestamp", -1)], projection={"timestamp": 1})
    sim_ts = last["timestamp"]
    if sim_ts.tzinfo is None:
        sim_ts = sim_ts.replace(tzinfo=timezone.utc)
    step = timedelta(minutes=args.interval_minutes)
    dt_hours = args.interval_minutes / 60.0
    rng = np.random.default_rng()

    running = {"go": True}
    signal.signal(signal.SIGINT, lambda *_: running.update(go=False))
    deadline = time.monotonic() + args.max_hours * 3600 if args.max_hours else None
    logger.info("Replaying %d customers: +%.0f sim-min every %.3gs "
                "(retain %.0f sim-days, max %.0fh; Ctrl+C to stop) ...",
                len(state), args.interval_minutes, args.tick,
                args.retain_days or 0, args.max_hours or 0)

    ticks = 0
    while running["go"]:
        t0 = time.monotonic()
        sim_ts = sim_ts + step
        docs = [make_reading(did, st, sim_ts, dt_hours, rng) for did, st in state.items()]
        col.insert_many(docs, ordered=False)
        # Internal overflow guard: keep only a rolling window of readings.
        if args.retain_days:
            cutoff = sim_ts - timedelta(days=args.retain_days)
            col.delete_many({"timestamp": {"$lt": cutoff}})
        ticks += 1
        if ticks % 5 == 0:
            logger.info("tick %d — sim %s — inserted %d readings", ticks, sim_ts.isoformat(), len(docs))
        # Internal auto-stop so a forgotten feeder can't run forever.
        if deadline and time.monotonic() >= deadline:
            logger.info("Reached --max-hours limit; stopping.")
            break
        time.sleep(max(0.0, args.tick - (time.monotonic() - t0)))

    logger.info("Stopped after %d ticks.", ticks)


if __name__ == "__main__":
    main()
