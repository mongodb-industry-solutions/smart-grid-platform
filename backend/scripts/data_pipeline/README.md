# Smart Grid data pipeline

Generates the demo's operational data in code (replacing the old Jupyter-notebook
workflow). Stage: **filter → expand customers → synthesize schema → inject grid stress**.

## Layout

```
data_pipeline/
  pipeline.py          the pipeline (Jupyter export, cleaned)
  load_to_mongo.py     loads outputs/ straight into a test cluster
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
uv run scripts/data_pipeline/load_to_mongo.py   # 2. load into the test cluster
```

`pipeline.py` reads only from `inputs/`, writes only to `outputs/`. Tunable knobs
(window, customer count, outage/stress params) live in its `Config` block.

### Loading target (safety)

`load_to_mongo.py` loads into a **separate test cluster** so the running demo can't
break. It reads its own env vars from `backend/.env` and refuses to run if they
point at the runtime cluster:

```
SEED_MONGODB_URI=<test cluster connection string>
SEED_DATABASE_NAME=<test database>
```

Each collection is dropped and reloaded (idempotent); `readings` is created as a
time-series collection.

## Data lineage → MongoDB collections

| Output (`outputs/`)        | Collection          | Notes                                  |
| -------------------------- | ------------------- | -------------------------------------- |
| `readings_final.json`      | `readings`          | time-series; carries `grid_event_id`   |
| `network_map.json`         | `meter_network_map` | meter → transformer/feeder/substation  |
| `customers_expanded.json`  | `customer_db`       | seed 25 expanded to `TOTAL_CUSTOMERS`  |
| `inputs/network.json`      | `network`           | canonical topology (input, seeded as-is) |
| `inputs/tariff_catalog.json` | `tariff_catalog`  | static tariffs (input, seeded as-is)   |

## TODO (next step)

`pipeline.py` still writes JSON files for manual Atlas import. Next: have it (or a
thin seeder) load straight into MongoDB using `backend/db/mdb.py` and the
time-series / vector-index helpers, so `restore-data.sh` + `dump/` become an
optional fallback rather than the primary path.
