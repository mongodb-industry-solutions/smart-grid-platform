# Smart Grid data pipeline

Generates the demo's operational data in code (replacing the old Jupyter-notebook
workflow). Stage: **filter → expand customers → synthesize schema → inject grid stress**.

## Layout

```
data_pipeline/
  pipeline.py          the pipeline (Jupyter export, cleaned)
  load_to_mongo.py     loads outputs/ straight into Atlas
  feeder.py            live: appends 1 reading/customer per tick (real-time stream)
  check_seed.py        sanity-checks the seeded data
  inputs/              committed source inputs
    readings_base.csv.gz base 15-min readings (gzip; pandas auto-decompresses)
    network.json         canonical grid topology (utility>substation>feeder>transformer)
    customer_seed.json   seed 25 customers + their city/state pairs
    tariff_catalog.json  static tariffs, seeded as-is
  outputs/             generated, git-ignored
```

## Run

```bash
cd backend
uv run scripts/data_pipeline/pipeline.py        # 1. generate outputs/
uv run scripts/data_pipeline/load_to_mongo.py   # 2. load into Atlas
```

`pipeline.py` reads only from `inputs/`, writes only to `outputs/`. Tunable knobs
(window, customer count, outage/stress params) live in its `Config` block.

### Loading target

All the scripts (`load_to_mongo.py`, `feeder.py`, `check_seed.py`) read the app's
own config — `MONGODB_URI` / `DATABASE_NAME` from `frontend/.env.local` (via
[`_config.py`](_config.py)) — so the pipeline seeds exactly the cluster/database
the app reads. There's no separate backend config to keep in sync.

Each collection is dropped and reloaded (idempotent); `readings` is created as a
time-series collection with `metaField=dataid`.

### Live feeder (real-time stream)

`feeder.py` appends one fresh reading per customer every tick, at the real wall
clock, on top of the seeded history:

```bash
uv run scripts/data_pipeline/feeder.py                       # accelerated replay: +15 sim-min every ~3s
uv run scripts/data_pipeline/feeder.py --tick 900            # true real-time (a new interval every 15 min)
uv run scripts/data_pipeline/feeder.py --retain-days 20      # tighter rolling window
```

It advances each customer's cumulative `energy` by `power * dt`, so consumption
derived from consecutive-reading differences stays correct at any cadence.

**Built-in overflow guards** (so it can never grow unbounded or run forever):
`--retain-days` (default 35) prunes readings older than a rolling window each
tick, and `--max-hours` (default 12) auto-stops the process. Set either to `0`
to disable.

**Frontend note:** the analytics were made cadence-agnostic so 1-second live
readings coexist with 15-min history — kW is derived from the real `dt` (not a
fixed ×4), monthly kWh from an energy-per-hour rate, and the consumption chart
buckets to 15 min so live data rolls up instead of flooding the axis. At ~1s the
collection grows by (250 × 3600) ≈ 900k docs/hour — use `--retain-days` (or a
TTL) for long-running demos.

## Data lineage → MongoDB collections

| Output (`outputs/`)        | Collection          | Notes                                  |
| -------------------------- | ------------------- | -------------------------------------- |
| `readings_final.json`      | `readings`          | time-series; carries `grid_event_id`   |
| `network_map.json`         | `meter_network_map` | meter → transformer/feeder/substation  |
| `customers_expanded.json`  | `customer_db`       | seed 25 expanded to `TOTAL_CUSTOMERS`  |
| `inputs/network.json`      | `network`           | canonical topology (input, seeded as-is) |
| `inputs/tariff_catalog.json` | `tariff_catalog`  | static tariffs (input, seeded as-is)   |

This pipeline is the **single source of truth** for the operational data — there
is no prebuilt dump. `load_to_mongo.py` seeds Atlas directly (`readings` as a
time-series collection with `metaField=dataid` + indexes), and the app's **Start
Demo** modal runs `pipeline.py` + `load_to_mongo.py` + `feeder.py` for you.
