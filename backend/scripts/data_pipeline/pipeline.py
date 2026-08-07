#!/usr/bin/env python
# coding: utf-8

# # SmartMeters Pipeline — Filter, Expand & Synthesize
# Continues the logic of `smip_schema.ipynb` and `readings_generator__1_.ipynb`.
# 
# This single notebook takes a post-generation CSV (`readings_enriched.csv`) and:
# 
# 1. **Filters** by start date + duration (24h, 1 week, ...)
# 2. **Expands** the customer set (e.g. 25 → 250), new customers reuse only existing city/state pairs
# 3. **Synthesizes** the full readings schema (appliance breakdown, `has_ev`, `ev_power`, `env_power`), rebases the base year to the CURRENT year and anchors the window to "now", and injects outages (full dropouts + partial brownouts)
# 
# Output is JSON so `has_ev` (bool) and `timestamp` ($date) keep their real BSON types on Atlas import.

# ## Configuration
# Edit these, then Run All.

# In[23]:

# ── Paths ─────────────────────────────────────────────────────────────────────
# Resolve everything relative to this script so it runs from any cwd.
import os as _os
_HERE    = _os.path.dirname(_os.path.abspath(__file__))
_INPUTS  = _os.path.join(_HERE, "inputs")
_OUTPUTS = _os.path.join(_HERE, "outputs")
_os.makedirs(_OUTPUTS, exist_ok=True)

# ── Config ────────────────────────────────────────────────────────────────────
import datetime as _dt
_NOW = _dt.datetime.now(_dt.timezone.utc)   # resolved at run time, never hard-coded

INPUT_CSV        = _os.path.join(_INPUTS, "readings_base.csv.gz")  # base readings (gzip; pandas auto-decompresses)
LOCATIONS_FILE   = _os.path.join(_INPUTS, "customer_seed.json")  # city/state pairs to reuse
TOTAL_CUSTOMERS  = 250          # grow customer set to this many (keeps existing 25)
START            = None         # None = earliest available slice; ANCHOR_NOW re-pins it to today
DURATION         = "30d"       # 24h, 1w, 3d, 30m, 2mo, 1y ... or None for no end
SHIFT_YEAR       = _NOW.year    # rebase timestamps to the CURRENT year (dynamic, not static)
ANCHOR_NOW       = True          # shift the whole window onto the current clock so the
                                 # data looks like it's being read in real time
ANCHOR_MODE      = "end"         # "end" -> last reading = now (recent history, best for
                                 # dashboards); "start" -> first reading = now (future window)
OUTAGE_MODE      = "both"       # "none" | "full" | "partial" | "both"
OUTAGE_TARGET_PCT = 0.10        # target fraction of customers that see >=1 outage
                                # (auto-computes OUTAGE_RATE from the window size).
                                # Set to None to use OUTAGE_RATE directly instead.
OUTAGE_RATE      = 0.01         # per-interval start chance (used only if TARGET_PCT is None)
OUTAGE_FULL_FRAC = 0.5          # of outages, fraction that are full dropouts (rest partial)
OUTAGE_MIN_LEN   = 1            # min consecutive intervals an outage lasts
OUTAGE_MAX_LEN   = 5            # max consecutive intervals (e.g. 4 = up to 1h at 15-min data)
SEED             = 42           # reproducible RNG
OUT_JSON         = _os.path.join(_OUTPUTS, "readings_final.json")
OUT_CUSTOMERS    = _os.path.join(_OUTPUTS, "customers_expanded.csv")
OUT_CUSTOMERS_JSON = _os.path.join(_OUTPUTS, "customers_expanded.json")  # collection, for Atlas import
NETWORK_OUT_JSON  = _os.path.join(_OUTPUTS, "network_map.json")  # meter -> grid topology, its own collection

# --- Grid topology (utility_id > substation_id > feeder_id > transformer_id > meter) ---
# Loaded from the canonical network/asset collection rather than invented, so meters
# only ever reference transformer/feeder/substation IDs that actually exist there.
NETWORK_ASSETS_JSON = _os.path.join(_INPUTS, "network.json")

# --- Grid stress simulation ("recreate stressful behaviour" for a utility) ---
STRESS_ENABLED       = True     # inject correlated cascading outages, not just independent ones
STRESS_COVER_ALL_UTILITIES = True  # one event per utility, spread across time, instead of
                                    # clustering every event onto one random substation/area
STRESS_EVENTS_PER_UTILITY  = 1  # only used when STRESS_COVER_ALL_UTILITIES is False
STRESS_SCOPE     = "feeder" # "feeder" (localized, realistic) or "substation" (bigger blast radius)
STRESS_START     = None     # ISO ts to force every event there, or None to spread them out
STRESS_DURATION  = "3h"     # how long each event lasts
STRESS_SEVERITY  = 0.5      # fraction of METERS in scope that go down for the whole event
STRESS_FULL_FRAC = 0.4      # of those affected meters, fraction that trip fully (rest brownout)
STRESS_LABEL     = "peak_demand_overload"  # e.g. heatwave/cold-snap driven transformer overload


# In[24]:

import json, re
from datetime import timezone
import numpy as np
import pandas as pd

rng = np.random.default_rng(SEED)


# ## 1. Filter by time
# Parse flexible durations and slice a window.

# In[25]:

_DUR_RE = re.compile(r"(?P<val>\d+(?:\.\d+)?)\s*(?P<unit>mo|[smhdwy])", re.IGNORECASE)
_UNIT = {"s":"seconds","m":"minutes","h":"hours","d":"days","w":"weeks"}

def parse_duration(text):
    """'24h' -> 24h, '1w' -> 7d, also 3d, 30m, 90s, 2mo, 1y."""
    m = _DUR_RE.fullmatch(text.strip().lower())
    if not m:
        raise ValueError(f"Bad duration {text!r}. Use 24h, 1w, 3d, 30m, 2mo, 1y.")
    val, unit = float(m.group("val")), m.group("unit")
    if unit == "mo": return pd.Timedelta(days=30*val)
    if unit == "y":  return pd.Timedelta(days=365*val)
    return pd.Timedelta(**{_UNIT[unit]: val})

def as_utc(ts):
    ts = pd.Timestamp(ts)
    return ts.tz_localize("UTC") if ts.tzinfo is None else ts.tz_convert("UTC")

def filter_time(df, start, duration):
    df = df.copy()
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    start = as_utc(start) if start else df["timestamp"].min()
    if duration is None:
        mask = df["timestamp"] >= start
    else:
        end = start + duration
        mask = (df["timestamp"] >= start) & (df["timestamp"] < end)
    return df[mask].sort_values(["dataid","timestamp"]).reset_index(drop=True)


# In[26]:

df = pd.read_csv(INPUT_CSV)
if "avg_reading" not in df.columns:
    df["avg_reading"] = (df["volt_leg_1"] + df["volt_leg_2"]) / 2

# Shift the base year FIRST so START/DURATION are expressed in the output year.
df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
if SHIFT_YEAR:
    year_delta = SHIFT_YEAR - df["timestamp"].min().year
    df["timestamp"] = df["timestamp"] + pd.DateOffset(years=year_delta)

dur = parse_duration(DURATION) if DURATION else None
df = filter_time(df, START, dur)

# Anchor the window onto the current clock so the readings look "live". Shift every
# timestamp by a single delta (preserves the 15-min cadence and all relative spacing).
if ANCHOR_NOW and len(df):
    now = pd.Timestamp.now(tz="UTC").floor("15min")
    ref = df["timestamp"].max() if ANCHOR_MODE == "end" else df["timestamp"].min()
    df["timestamp"] = df["timestamp"] + (now - ref)
    print(f"[anchor] {ANCHOR_MODE} of window -> {now} (now)")

print(f"rows      : {len(df):,}")
print(f"customers : {df['dataid'].nunique()} real")
print(f"window    : {df['timestamp'].min()} -> {df['timestamp'].max()}")
print(f"intervals : {df['timestamp'].nunique()}")
df.head()


# ## 2. Expand customers
# Keep the existing customers; add new ones reusing only existing city/state pairs.

# In[27]:

import glob, os

def load_locations(path):
    """Load city/state pairs. If the named file is missing, auto-find a
    customer-db JSON/CSV in the current folder so a filename mismatch
    (dot vs underscore, etc.) doesn't crash the notebook."""
    if path is None or not os.path.exists(path):
        candidates = (glob.glob("*customer*db*.json") + glob.glob("*customer*.json")
                      + glob.glob("*customer*db*.csv") + glob.glob("customer*.csv"))
        if candidates:
            found = candidates[0]
            if path and path != found:
                print(f"[load_locations] {path!r} not found; using {found!r}")
            path = found
        else:
            print("[load_locations] no locations file found; new customers "
                  "will reuse locations already present in the readings, if any.")
            return None
    if str(path).endswith(".json"):
        data = json.load(open(path))
        return pd.DataFrame([{"dataid":int(r["dataid"]),"city":r["city"],"state":r["state"]}
                             for r in data])
    return pd.read_csv(path)

def expand_customers(existing_ids, loc_df, total, rng):
    existing_ids = sorted(int(i) for i in existing_ids)
    if loc_df is not None and {"city","state"}.issubset(loc_df.columns):
        loc_pool = loc_df[["city","state"]].dropna().drop_duplicates()
        id_to_loc = {int(r.dataid):(r.city,r.state) for r in loc_df.itertuples()
                     if "dataid" in loc_df.columns and pd.notna(getattr(r,"dataid",None))}
    else:
        loc_pool = pd.DataFrame([{"city":"Austin","state":"Texas"}]); id_to_loc = {}

    rows = []
    for did in existing_ids:
        city, state = id_to_loc.get(did, tuple(loc_pool.iloc[0]))
        rows.append({"dataid":did,"city":city,"state":state})

    used = set(existing_ids); hi = max(9999, max(existing_ids)+1)
    while len(rows) < total:
        did = int(rng.integers(1000, hi+5000))
        if did in used: continue
        used.add(did)
        loc = loc_pool.iloc[int(rng.integers(0,len(loc_pool)))]
        rows.append({"dataid":did,"city":loc["city"],"state":loc["state"]})
    return pd.DataFrame(rows[:total])


# In[28]:

loc_df = load_locations(LOCATIONS_FILE)
customers = expand_customers(df["dataid"].unique(), loc_df, TOTAL_CUSTOMERS, rng)

print(f"customers : {len(customers):,} (target {TOTAL_CUSTOMERS})")
print("locations :")
print(customers.groupby(["city","state"]).size().to_string())
customers.head()


# ## 3. Synthesize
# Fill the remaining schema fields. Real customers keep their original energy values;
# new customers get fresh physics-based values. Appliance channels always sum exactly to `power`.
# Outages are a random mix of full dropouts and partial brownouts.

# In[29]:

def rand(rng, lo, hi, nd=3):
    return round(float(rng.uniform(lo, hi)), nd)

def customer_profile(rng):
    return {"has_ev":bool(rng.random()<0.35),
            "hvac_share":rand(rng,0.25,0.5,3),
            "heat_share":rand(rng,0.05,0.25,3),
            "energy0":rand(rng,0,500)}

def split_power(total_power, prof, hour, rng):
    """Break total power into channels that sum EXACTLY to the returned power."""
    hvac    = max(0.0, total_power*prof["hvac_share"]*(0.6+0.8*np.sin((hour/24)*np.pi)))
    heating = max(0.0, total_power*prof["heat_share"]*(1.3 if hour<7 or hour>20 else 0.6))
    kitchen = max(0.0, total_power*rand(rng,0.05,0.15)*(2.0 if hour in (7,8,12,18,19) else 0.4))
    laundry = max(0.0, total_power*rand(rng,0.03,0.10)*(1.8 if 18<=hour<=22 else 0.3))
    if prof["has_ev"] and (hour>=22 or hour<=5) and rng.random()<0.6:
        ev = rand(rng,1500,7000)
    else:
        ev = 0.0
    hvac,heating,kitchen,laundry,ev = (round(x,3) for x in (hvac,heating,kitchen,laundry,ev))
    grand = round(total_power+ev,3)
    env = round(grand-(hvac+heating+kitchen+laundry+ev),3)
    if env < 0:
        grand = round(grand-env,3); env = 0.0
    return {"hvac_power":hvac,"heating_power":heating,"kitchen_power":kitchen,
            "laundry_power":laundry,"ev_power":ev,"env_power":env,"power":grand}

def outage_starts(rng, mode, rate):
    """Decide whether a NEW outage starts this interval; returns kind or None."""
    if mode=="none" or rng.random()>=rate:
        return None
    if mode in ("full","partial"):
        return mode
    return "full" if rng.random()<OUTAGE_FULL_FRAC else "partial"

def outage_length(rng):
    """How many consecutive intervals the outage lasts."""
    return int(rng.integers(OUTAGE_MIN_LEN, OUTAGE_MAX_LEN+1))

def make_doc(ts, did, prof, channels, amps, pf, freq, v1, v2, cumulative, interval_kwh):
    avg = round((v1+v2)/2,3)
    return {"avg_reading":float(avg),"current":float(amps),"dataid":int(did),
            "energy":float(cumulative),
            # Precomputed consumption for THIS interval (energy − previous energy),
            # so consumption/tariff/weather queries sum a field instead of diffing
            # consecutive cumulative readings at query time.
            "interval_kwh":float(interval_kwh),
            "env_power":float(channels["env_power"]),
            "ev_power":float(channels["ev_power"]),"frequency":float(freq),
            "has_ev":bool(prof["has_ev"]),"heating_power":float(channels["heating_power"]),
            "hvac_power":float(channels["hvac_power"]),"kitchen_power":float(channels["kitchen_power"]),
            "laundry_power":float(channels["laundry_power"]),"power":float(channels["power"]),
            "power_factor":float(pf),
            "timestamp":{"$date":ts.astimezone(timezone.utc).isoformat().replace("+00:00","Z")},
            "volt_leg_1":float(v1),"volt_leg_2":float(v2),"voltage":float(avg)}


# In[30]:

def synthesize(df, customers, rng):
    # Year already shifted up-front, before filtering.
    tl = df.drop_duplicates("timestamp").sort_values("timestamp").reset_index(drop=True)

    # Effective per-interval outage start rate.
    N = max(1, len(tl))
    if OUTAGE_TARGET_PCT is not None and OUTAGE_MODE != "none":
        # Solve 1-(1-rate)^N = target  ->  rate = 1-(1-target)^(1/N)
        eff_rate = 1 - (1 - OUTAGE_TARGET_PCT) ** (1.0 / N)
        # account for avg outage length reducing #starts needed to hit target
        avg_len = (OUTAGE_MIN_LEN + OUTAGE_MAX_LEN) / 2
        eff_rate = eff_rate / max(1.0, avg_len ** 0.5)
        print(f"[outages] target {OUTAGE_TARGET_PCT:.0%} of customers over {N} "
              f"intervals -> start rate {eff_rate:.5f}")
    else:
        eff_rate = OUTAGE_RATE

    # Which enriched columns are actually present? If a column is missing we
    # synthesize it instead of reading it (works on raw readings.csv too).
    ENRICHED = ["current","power_factor","frequency","power","energy"]
    have = {col: (col in df.columns) for col in ENRICHED}

    real = {int(k): g.sort_values("timestamp").reset_index(drop=True)
            for k,g in df.groupby("dataid")}
    real_ids = set(real)

    docs = []
    for _, c in customers.iterrows():
        did = int(c["dataid"]); prof = customer_profile(rng)
        cumulative = prof["energy0"]; src = real.get(did)
        prev_cum = cumulative  # energy at the previous interval, for interval_kwh
        outage_remaining = 0   # intervals left in the current sustained outage
        outage_active = None   # "full" or "partial" while an outage persists

        for i, trow in tl.iterrows():
            ts = trow["timestamp"].to_pydatetime()
            hour = ts.hour
            is_real = did in real_ids and i < len(src)

            if is_real:
                r = src.iloc[i]
                # Preserve real voltage legs; synthesize any missing OR NaN enriched
                # field (source CSVs can have gaps, and NaN isn't valid JSON downstream).
                v1r, v2r = r["volt_leg_1"], r["volt_leg_2"]
                if pd.isna(v1r) or pd.isna(v2r):
                    v1=rand(rng,118,125); v2=rand(rng,118,125)
                else:
                    v1 = float(v1r); v2 = float(v2r)
                avg = (v1 + v2) / 2

                amps = float(r["current"])      if have["current"]      and pd.notna(r["current"])      else rand(rng,0.5,30.0)
                pf   = float(r["power_factor"]) if have["power_factor"] and pd.notna(r["power_factor"]) else rand(rng,0.85,0.99)
                freq = float(r["frequency"])    if have["frequency"]    and pd.notna(r["frequency"])    else rand(rng,59.95,60.05)
                total_power = float(r["power"]) if have["power"]        and pd.notna(r["power"])        else round(avg*amps*pf,3)
                if have["energy"] and pd.notna(r["energy"]):
                    cumulative = float(r["energy"])
                # if energy missing/NaN, cumulative carries over from previous interval
            else:
                v1=rand(rng,118,125); v2=rand(rng,118,125); avg=(v1+v2)/2
                amps=rand(rng,0.5,30.0); pf=rand(rng,0.85,0.99)
                freq=rand(rng,59.95,60.05); total_power=round(avg*amps*pf,3)

            channels = split_power(total_power, prof, hour, rng)

            # ── Outage state machine ──────────────────────────────────────
            # Continue an active outage, or roll to start a new one.
            if outage_remaining > 0:
                k = outage_active
                outage_remaining -= 1
            else:
                k = outage_starts(rng, OUTAGE_MODE, eff_rate)
                if k is not None:
                    outage_active = k
                    outage_remaining = outage_length(rng) - 1  # this interval counts as 1
                else:
                    outage_active = None

            if k=="full":
                v1=rand(rng,0,5); v2=rand(rng,0,5); amps=pf=freq=0.0
                channels={kk:0.0 for kk in channels}
            elif k=="partial":
                sag=rand(rng,0.70,0.85)
                v1=round(v1*sag,3); v2=round(v2*sag,3)
                amps=round(amps*rand(rng,0.4,0.7),3); freq=rand(rng,59.5,59.9)
                shed=rand(rng,0.4,0.7)
                channels={kk:round(val*shed,3) for kk,val in channels.items()}
                channels["power"]=round(sum(channels[x] for x in
                    ["hvac_power","heating_power","kitchen_power",
                     "laundry_power","ev_power","env_power"]),3)

            if not is_real or not have["energy"]:
                cumulative = round(cumulative + (channels["power"]/1000)*0.25, 5)

            # Consumption this interval = rise in the cumulative register (clamped
            # so source gaps/resets never yield a negative).
            interval_kwh = round(max(0.0, cumulative - prev_cum), 5)
            prev_cum = cumulative

            docs.append(make_doc(ts,did,prof,channels,amps,pf,freq,v1,v2,cumulative,interval_kwh))
    return docs

docs = synthesize(df, customers, rng)
print(f"documents : {len(docs):,}")
docs[0]


# ## 4. Meter network map
# Load the canonical grid topology from `NETWORK_ASSETS_JSON` (utility -> substation ->
# feeder -> transformer, one doc per asset with `asset_id`/`asset_type`/`parent_asset_id`)
# and assign every meter to one of *that file's* transformers -- never an invented one.
# This is what keeps `network_map` and the `network` collection in sync: any downstream
# query that walks the asset tree (e.g. summing meters per utility) will always resolve,
# because every `transformer_id` a meter references is guaranteed to exist in the tree.

# In[31]:

def load_network_assets(path):
    """Read the canonical network/asset collection and resolve each transformer's
    full ancestry (feeder -> substation -> utility) via parent_asset_id, plus the
    city it belongs to. Returns a dict: city_key -> list of valid leaf mappings."""
    raw = json.load(open(path))
    assets = pd.DataFrame(raw)
    parent = assets.set_index("asset_id")["parent_asset_id"].to_dict()

    xfmrs = assets[assets["asset_type"] == "transformer"].copy()
    xfmrs["feeder_id"] = xfmrs["asset_id"].map(parent)
    feeder_parent = assets[assets["asset_type"] == "feeder"].set_index("asset_id")["parent_asset_id"]
    xfmrs["substation_id"] = xfmrs["feeder_id"].map(feeder_parent)
    sub_parent = assets[assets["asset_type"] == "substation"].set_index("asset_id")["parent_asset_id"]
    xfmrs["utility_id"] = xfmrs["substation_id"].map(sub_parent)

    pool = {}
    for city_key, grp in xfmrs.groupby(xfmrs["city"].str.lower().str.replace(" ", "_")):
        pool[city_key] = grp[["utility_id","substation_id","feeder_id","asset_id"]] \
            .rename(columns={"asset_id": "transformer_id"}).to_dict("records")
    return pool, assets

NETWORK_POOL, _network_assets = load_network_assets(NETWORK_ASSETS_JSON)
print(f"loaded {sum(len(v) for v in NETWORK_POOL.values()):,} transformer leaves "
      f"across {len(NETWORK_POOL)} cities from {NETWORK_ASSETS_JSON}")

def build_network_map(customers, rng, pool):
    """Assign every meter to a real transformer leaf in `pool`, matched by city.
    Customers in a city the asset file doesn't cover are reported, not force-mapped
    onto an invented node."""
    rows, missing = [], {}
    for _, c in customers.iterrows():
        did, city, state = int(c["dataid"]), c["city"], c["state"]
        key = str(city).lower().replace(" ", "_")
        options = pool.get(key)
        if not options:
            missing[city] = missing.get(city, 0) + 1
            continue
        choice = options[int(rng.integers(0, len(options)))]
        rows.append({"dataid": did, "city": city, "state": state, **choice})

    if missing:
        print(f"[network map] WARNING: {sum(missing.values())} meter(s) across "
              f"{len(missing)} cit{'y' if len(missing)==1 else 'ies'} have no matching "
              f"transformer in {NETWORK_ASSETS_JSON} and were left unmapped: {missing}")
    return pd.DataFrame(rows)

network_df = build_network_map(customers, rng, NETWORK_POOL)

print(f"meters mapped   : {len(network_df):,} / {len(customers):,}")
print(f"utilities       : {network_df['utility_id'].nunique()}")
print(f"substations     : {network_df['substation_id'].nunique()}")
print(f"feeders         : {network_df['feeder_id'].nunique()}")
print(f"transformers    : {network_df['transformer_id'].nunique()}")
print(f"avg meters/xfmr : {len(network_df) / network_df['transformer_id'].nunique():.1f}")
network_df.head()


# ## 5. Attach topology + simulate grid stress
# Merge each meter's `transformer_id` / `feeder_id` / `substation_id` onto its readings,
# then optionally inject a **correlated** stress event: pick a substation and a time
# window (one per utility, each in its own slice of time so they don't all cluster in one spot), scoped to a single feeder by default, and pushes a fixed fraction of that feeder's meters into outage/brownout for the whole window — a transformer or
# feeder overloading under peak demand — instead of the fully independent random outages
# used above. This is what lets you recreate a stressful moment for one specific utility
# at one specific point in time (and it shows up as its own `grid_events` collection).
# Affected readings are tagged with `grid_event_id` / `grid_event_label` directly, so the event is queryable from the `readings` collection itself — no separate `grid_events` collection is exported.
# 

# In[32]:

# Denormalize the grid hierarchy AND the region (state/city) onto every reading,
# so the demand/forecast analytics run as single-collection $match+$group with no
# $lookup back into meter_network_map (data accessed together, stored together).
_net_lookup = network_df.set_index("dataid")[
    ["utility_id","substation_id","feeder_id","transformer_id","state","city"]
].to_dict("index")

for d in docs:
    info = _net_lookup.get(d["dataid"])
    if info:
        d["utility_id"]      = info["utility_id"]
        d["substation_id"]  = info["substation_id"]
        d["feeder_id"]      = info["feeder_id"]
        d["transformer_id"] = info["transformer_id"]
        d["state"]          = info["state"]
        d["city"]           = info["city"]

def _doc_ts(d):
    t = d["timestamp"]
    return pd.Timestamp(t["$date"] if isinstance(t, dict) else t)

def simulate_grid_stress(docs, network_df, rng):
    """Force a correlated outage/brownout across one feeder (or substation) at a time,
    simulating a transformer/feeder overload under peak demand. By default every
    utility gets exactly one event, each in its own slice of the overall time range,
    so anomalies are spread out across areas and across time. STRESS_SEVERITY picks
    a fraction of the METERS in scope once per event -- each affected meter stays
    down (full or brownout) for the entire window, rather than re-rolling every
    15-minute reading, so the numbers are predictable and don't creep toward 100%
    of the scope over a multi-hour window. Mutates docs in place; readings carry
    grid_event_id so no separate collection is needed."""
    if not STRESS_ENABLED or not docs:
        return []

    all_ts = sorted({_doc_ts(d) for d in docs})
    if not all_ts:
        return []

    scope_col = "feeder_id" if STRESS_SCOPE == "feeder" else "substation_id"

    if STRESS_COVER_ALL_UTILITIES:
        # one target scope-unit per utility -> every utility gets an anomaly
        targets = []
        for uid, grp in network_df.groupby("utility_id"):
            units = grp[scope_col].unique().tolist()
            targets.append(units[int(rng.integers(0, len(units)))])
    else:
        units = network_df[scope_col].unique().tolist()
        if not units:
            return []
        targets = [units[int(rng.integers(0, len(units)))] for _ in range(STRESS_EVENTS_PER_UTILITY)]

    dur = parse_duration(STRESS_DURATION)
    span_start, span_end = all_ts[0], all_ts[-1]
    n = max(1, len(targets))
    slice_len = (span_end - span_start) / n  # each event gets its own chunk of time

    events = []
    for e, unit_id in enumerate(targets):
        if STRESS_START:
            start = as_utc(STRESS_START)
        else:
            slice_start = span_start + slice_len * e
            usable = max(slice_len - dur, pd.Timedelta(0))
            start = slice_start + pd.Timedelta(seconds=rng.uniform(0, max(usable.total_seconds(), 1)))
        end = start + dur

        hit_ids = list(network_df.loc[network_df[scope_col] == unit_id, "dataid"])
        n_affected = round(len(hit_ids) * STRESS_SEVERITY)
        affected_ids = set(rng.choice(hit_ids, size=n_affected, replace=False)) if n_affected else set()
        n_full = round(len(affected_ids) * STRESS_FULL_FRAC)
        full_ids = set(rng.choice(sorted(affected_ids), size=n_full, replace=False)) if n_full else set()

        readings_touched = 0
        for d in docs:
            if d["dataid"] not in affected_ids:
                continue
            ts = _doc_ts(d)
            if not (start <= ts < end):
                continue
            readings_touched += 1
            d["grid_event_id"] = f"EVT-{e+1:03d}"
            d["grid_event_label"] = STRESS_LABEL

            if d["dataid"] in full_ids:
                d["volt_leg_1"] = d["volt_leg_2"] = d["voltage"] = 0.0
                d["current"] = d["power_factor"] = d["frequency"] = 0.0
                for k in ["hvac_power","heating_power","kitchen_power","laundry_power","ev_power","env_power","power"]:
                    d[k] = 0.0
            else:
                sag = rand(rng, 0.55, 0.80)
                d["volt_leg_1"] = round(d["volt_leg_1"] * sag, 3)
                d["volt_leg_2"] = round(d["volt_leg_2"] * sag, 3)
                d["voltage"] = round((d["volt_leg_1"] + d["volt_leg_2"]) / 2, 3)
                d["frequency"] = rand(rng, 59.2, 59.8)
                shed = rand(rng, 0.3, 0.6)
                for k in ["hvac_power","heating_power","kitchen_power","laundry_power","ev_power","env_power"]:
                    d[k] = round(d[k] * shed, 3)
                d["power"] = round(sum(d[k] for k in
                    ["hvac_power","heating_power","kitchen_power","laundry_power","ev_power","env_power"]), 3)

        events.append({
            "event_id": f"EVT-{e+1:03d}",
            "label": STRESS_LABEL,
            "scope": STRESS_SCOPE,
            "scope_id": unit_id,
            "utility_id": network_df.loc[network_df[scope_col] == unit_id, "utility_id"].iloc[0],
            "start": {"$date": start.tz_convert("UTC").isoformat().replace("+00:00", "Z")},
            "end":   {"$date": end.tz_convert("UTC").isoformat().replace("+00:00", "Z")},
            "meters_in_scope": len(hit_ids),
            "meters_affected": len(affected_ids),
            "readings_affected": readings_touched,
            "meters_tripped_full": len(full_ids),
            "severity_target": STRESS_SEVERITY,
        })
        print(f"[grid stress] {unit_id} ({events[-1]['utility_id']}): "
              f"{len(affected_ids)}/{len(hit_ids)} meters hit, {len(full_ids)} full trips, "
              f"{start} -> {end}")

    return events

grid_events = simulate_grid_stress(docs, network_df, rng)


# ## Validate
# Quick sanity checks before export.

# In[33]:

mism = sum(1 for x in docs if abs(sum(x[k] for k in
    ["hvac_power","heating_power","kitchen_power","laundry_power","ev_power","env_power"])
    - x["power"]) > 0.01)
print("channels != power     :", mism)
print("ev_power>0 w/o has_ev  :", sum(1 for x in docs if x["ev_power"]>0 and not x["has_ev"]))
print("full outages          :", sum(1 for x in docs if x["power"]==0 and x["current"]==0))
print("partial/brownouts     :", sum(1 for x in docs if 0<x["frequency"]<59.95))
print("first timestamp       :", docs[0]["timestamp"])


# ## Outage summary
# Counts both **outage events** (consecutive runs grouped) and **outage intervals**
# (individual 15-min readings), plus % of customers affected and the longest outage.

# In[34]:

import pandas as pd

# Outages are detected from the physical readings (no extra column stored):
#   full outage    -> power == 0 and current == 0
#   partial outage -> voltage sags well below the customer's own normal level
_s = pd.DataFrame(docs)
_s["dataid"] = _s["dataid"].astype(int)
_s["_ts"] = _s["timestamp"].map(lambda t: t["$date"] if isinstance(t, dict) else t)

INTERVAL_MIN = 15  # readings cadence

_full = (_s["power"] == 0) & (_s["current"] == 0)

# Each customer's "normal" voltage = median of their non-full readings.
_norm_v = _s.loc[~_full].groupby("dataid")["voltage"].median()
_s["_normv"] = _s["dataid"].map(_norm_v)
# Partial = not full, positive voltage, sagged to < 90% of the customer's normal.
_partial = (~_full) & (_s["voltage"] > 0) & (_s["voltage"] < 0.90 * _s["_normv"])

_s["is_outage"] = _full | _partial

def _summarize(g):
    g = g.sort_values("_ts").reset_index(drop=True)
    events, cur = [], 0
    for flag in g["is_outage"]:
        if flag:
            cur += 1
        elif cur:
            events.append(cur); cur = 0
    if cur:
        events.append(cur)
    return pd.Series({
        "outage_intervals": int(g["is_outage"].sum()),
        "outage_events": len(events),
        "longest_run": max(events) if events else 0,
    })

per_cust = _s.groupby("dataid").apply(_summarize, include_groups=False)

total_intervals = int(per_cust["outage_intervals"].sum())
total_events    = int(per_cust["outage_events"].sum())
customers_hit   = int((per_cust["outage_events"] > 0).sum())
pct_hit         = customers_hit / len(per_cust) * 100
longest_min     = int(per_cust["longest_run"].max() * INTERVAL_MIN)

outage_summary = {
    "total_outage_events":    total_events,      # grouped consecutive runs
    "total_outage_intervals": total_intervals,   # individual 15-min readings
    "full_outage_intervals":  int(_full.sum()),
    "partial_outage_intervals": int(_partial.sum()),
    "customers_with_outage":  customers_hit,
    "customers_pct":          round(pct_hit, 1),
    "longest_outage_minutes": longest_min,
    "longest_outage_label":   f"{longest_min//60}h {longest_min%60}m",
}

print("Outage summary")
print(f"  Total outage events    : {total_events:,}")
print(f"  Total outage intervals : {total_intervals:,}  "
      f"(full {outage_summary['full_outage_intervals']}, "
      f"partial {outage_summary['partial_outage_intervals']})")
print(f"  Customers with outage  : {customers_hit}/{len(per_cust)} ({pct_hit:.1f}%)")
print(f"  Longest outage         : {outage_summary['longest_outage_label']}")
outage_summary


# ## Export
# JSON array (Atlas-import ready) + expanded customers CSV.

# In[35]:

import math

def _sanitize(o):
    """Recursively swap NaN/Inf for None so the export is strict, valid JSON
    (Python's json module writes bare NaN/Infinity tokens by default, which
    Atlas and most JSON viewers/renderers reject)."""
    if isinstance(o, float):
        return None if (math.isnan(o) or math.isinf(o)) else o
    if isinstance(o, dict):
        return {k: _sanitize(v) for k, v in o.items()}
    if isinstance(o, list):
        return [_sanitize(v) for v in o]
    return o

def _count_bad(o, n=0):
    if isinstance(o, float) and (o != o or o in (float("inf"), float("-inf"))):
        return n + 1
    if isinstance(o, dict):
        return sum(_count_bad(v) for v in o.values())
    if isinstance(o, list):
        return sum(_count_bad(v) for v in o)
    return n

docs_out      = _sanitize(docs)
customers_out = _sanitize(customers.to_dict("records"))
network_out   = _sanitize(network_df.to_dict("records"))

n_bad = sum(_count_bad(x) for x in (docs, customers.to_dict("records"), network_df.to_dict("records")))
if n_bad:
    print(f"[sanitize] found {n_bad} NaN/Inf value(s); wrote them as JSON null so the export stays valid\n")

json.dump(docs_out, open(OUT_JSON,"w"), indent=2)
customers.to_csv(OUT_CUSTOMERS, index=False)
json.dump(customers_out, open(OUT_CUSTOMERS_JSON,"w"), indent=2)
json.dump(network_out, open(NETWORK_OUT_JSON,"w"), indent=2)

print(f"saved -> {OUT_JSON}          ({len(docs):,} docs)")
print(f"saved -> {OUT_CUSTOMERS}     ({len(customers):,} customers)")
print(f"saved -> {OUT_CUSTOMERS_JSON} ({len(customers):,} customers, JSON)")
print(f"saved -> {NETWORK_OUT_JSON}  ({len(network_df):,} meter->grid mappings)")
print(f"stress events   : {len(grid_events)} (tagged in-line on readings via grid_event_id, not a separate file)")
print()
print("Atlas import:")
print("  1. Browse Collections -> Add Data -> Import File")
print(f"  2. Select {OUT_JSON}          -> readings collection (has_ev bool + timestamp date; "
      "stressed readings carry grid_event_id)")
print(f"  3. Select {NETWORK_OUT_JSON}   -> network_map collection (join on dataid)")
print(f"  4. Select {OUT_CUSTOMERS_JSON} -> customers collection (join on dataid)")
