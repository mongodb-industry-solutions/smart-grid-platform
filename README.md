# Smart Grid Intelligent Platform

This demo showcases how a utility can turn raw smart-meter data into real-time
operational decisions using MongoDB Atlas. Built on a single operational data
layer, it helps grid operators detect outages faster, monitor the health of the
grid network, understand customer consumption, forecast demand peaks, and
investigate issues in natural language.

It brings five workloads together over the same smart-meter data:

- **Monitoring** - outages, grid/feeder stability, anomalies, power factor, live readings, and a customer/outage map.
- **Network Center** - the grid topology (utility → substation → feeder → transformer), substation health, capacity pressure, and outage status.
- **Customers** - profile, latest reading, tariff recommendation, insights, appliance breakdown, usage segment, and consumption trend.
- **Forecasting** - expected demand and peak timing per region, weather-adjusted with external data, plus the exact aggregation pipeline behind it.
- **Grid Support Agent** - a LangGraph multi-agent chatbot that answers questions over the data and a knowledge base using hybrid search.

Every card exposes a `{ }` **"Show document"** button that reveals the real
documents and aggregation pipelines powering it.

## Where MongoDB Shines?

- **Atlas Time Series** - high-frequency smart-meter readings stored and queried efficiently.
- **Aggregation Framework** - analytics run in the database: `$setWindowFields`/`$shift` (gaps-and-islands outage detection), `$lookup` across the grid topology for utilization, and `$group` with `$stdDevSamp` for anomalies and forecasting.
- **Flexible document model** - meters, customers, and the grid hierarchy live as related documents joined on demand; the schema evolves without migrations.
- **Atlas Vector Search with automated Voyage AI embeddings** - semantic search with no separate embedding service.
- **Hybrid search** - vector + full-text results fused with Reciprocal Rank Fusion (RRF).
- **Agentic AI on MongoDB** - a LangGraph multi-agent with conversation memory persisted in Atlas (`agent_checkpoints`).

## High Level Architecture

The platform combines two architectures on a single Atlas cluster: an
**operational data layer** (monitoring, network, forecasting, customers) and an
**agentic AI layer** that lets users query it all in natural language.

### Operational data layer
![Operational data layer - Reference architecture](frontend/public/General_Architecture.svg)

### Agentic AI layer
![agentic AI layer - Reference architecture](frontend/public/Reference_Architectures.svg)

## Tech Stack

- Next.js [App Router](https://nextjs.org/docs/app) for the framework and API routes
- [MongoDB Atlas](https://www.mongodb.com/atlas/database) for the database, search, and agent memory
- [LangGraph.js](https://langchain-ai.github.io/langgraphjs/) for the multi-agent orchestration
- [Anthropic Claude](https://www.anthropic.com/) as the LLM and [Voyage AI](https://www.voyageai.com/) for embeddings
- [Recharts](https://recharts.org/) and [LeafyGreen UI](https://www.mongodb.design/) for the interface

## Prerequisites

Before you begin, ensure you have the following:

- **Node.js 22** or higher
- A **MongoDB Atlas** account with a cluster (**M10 or higher** - required for Atlas Vector Search with automated embeddings)
- **Python 3.13** and **[uv](https://docs.astral.sh/uv/)** - used by the data pipeline that generates and loads the operational collections
- An **Anthropic API key** (the AI assistant uses Claude)
- A **Voyage AI API key** (used by the Vector Map visualization)

## Run it Locally

### 1. Clone the repository

```bash
git clone https://github.com/mongodb-industry-solutions/smart-grid-platform.git
cd smart-meter
```

### 2. Install dependencies

The app (frontend) and the data pipeline (backend). The pipeline runs via `uv`,
which the **Start Demo** button also uses, so install both up front:

```bash
cd frontend && npm install
cd ../backend && uv sync          # data-pipeline deps (pandas, pymongo, ...)
```

### 3. Configure environment variables

Create a `.env.local` file inside the `frontend` folder:

```bash
MONGODB_URI=<YOUR_MONGODB_ATLAS_CONNECTION_STRING>
DATABASE_NAME=<YOUR_DATABASE_NAME>

# AI assistant - Claude via the standard Anthropic API
ANTHROPIC_API_KEY=<YOUR_ANTHROPIC_API_KEY>
# Optional: override the default model (claude-haiku-4-5)
# ANTHROPIC_MODEL=claude-haiku-4-5

# Vector Map visualization - direct Voyage AI embeddings
VOYAGE_API_KEY=<YOUR_VOYAGE_API_KEY>
```

> **MongoDB internal users** can instead point the assistant at the Grove gateway
> by setting `GROVE_API_KEY` (and optionally `GROVE_ANTHROPIC_URL`). When those are
> absent, the app uses the standard Anthropic API above.

If you need help getting your Atlas connection string, see
[Connect to your cluster](https://www.mongodb.com/docs/atlas/tutorial/connect-to-your-cluster/).

### 4. Start the app

From the `frontend` folder:

```bash
npm run dev
```

The app is now available at **http://localhost:3000**.

### 5. Generate the data - **Start Demo**

On first load, a **Start Demo** modal appears. Click **Start Demo** and it does
the whole setup for you, no terminal needed:

- generates the dataset in code - 30 days of 15-minute readings for 250 meters,
  **dated to today** - and loads it into Atlas as a time-series collection with indexes,
- seeds the AI knowledge base (with the Atlas Vector + full-text search indexes),
- starts the **live feeder** so the dashboards stream in real time.

It takes a couple of minutes; when it finishes, click **Enter the demo** and
explore Monitoring, Network Center, Customers, Forecasting, and the Grid Support
Agent. (The modal shows when the data was last generated and appears once per
browser session.)

> Atlas builds search indexes asynchronously, so the AI assistant's sources may
> take an extra minute to appear.

> **Security note:** Start Demo runs behind the `/api/demo/start` endpoint, which
> spawns processes and reloads collections. It ships with same-origin, cooldown,
> timeout, and kill-switch safeguards — see [DEMO_SECURITY.md](DEMO_SECURITY.md)
> for the threat model and how to lock it down for public deployments.

### Alternative: load the data from the CLI

Prefer the terminal, or automating a headless setup? Do exactly what the modal
does, by hand (full details in the
[data pipeline README](backend/scripts/data_pipeline/README.md)). From the
`backend` folder:

```bash
uv run scripts/data_pipeline/pipeline.py         # generate 30 days of history (dated to today)
uv run scripts/data_pipeline/load_to_mongo.py    # load it into Atlas
uv run scripts/data_pipeline/feeder.py           # stream live readings on top (leave running)
# or, generate + load in one step from the repo root: make seed_data
```

The feeder keeps streaming (that's what makes the dashboards move) until you stop
it with `Ctrl+C`; it has built-in guards so it can't overflow the collection or
run forever (`--retain-days`, default 35; `--max-hours`, default 12). Tune the
window and meter count in the `Config` block of `pipeline.py` (`DURATION`,
`TOTAL_CUSTOMERS`). Then seed the knowledge base, from the `frontend` folder:

```bash
node --env-file=.env.local scripts/seedKnowledgeBase.mjs
```

<!-- ### (Optional) Run the backend

The FastAPI scaffold is not required for the demo. If you want to run it:

```bash
# from the repo root
make uv_init
make uv_sync
cd backend
uv run uvicorn main:app --host 0.0.0.0 --port 8000
```

The backend API will be accessible at http://localhost:8000. Create a `.env` file
in `backend/` with `MONGODB_URI`, `DATABASE_NAME`, and `APP_NAME` if you use it. -->

## Environment variables

| Variable | Where | Required | Description |
| --- | --- | --- | --- |
| `MONGODB_URI` | `frontend/.env.local` | Yes | Atlas connection string. Used by the app **and** the data pipeline. |
| `DATABASE_NAME` | `frontend/.env.local` | Yes | Target database name. Used by the app **and** the data pipeline. |
| `ANTHROPIC_API_KEY` | `frontend/.env.local` | Yes* | Claude API key for the AI assistant. |
| `VOYAGE_API_KEY` | `frontend/.env.local` | Yes | Voyage AI key for the Vector Map. |
| `ANTHROPIC_MODEL` | `frontend/.env.local` | No | Override the default model (`claude-haiku-4-5`). |
| `GROVE_API_KEY` / `GROVE_ANTHROPIC_URL` | `frontend/.env.local` | No | MongoDB-internal Grove gateway (used instead of `ANTHROPIC_API_KEY` when set). |
| `DISABLE_DEMO_SETUP` | `frontend/.env.local` | No | Set to `true` to fully disable the **Start Demo** / `/api/demo/start` endpoint (locked-down deployments). |
| `DEMO_REGEN_COOLDOWN_MINUTES` | `frontend/.env.local` | No | Minimum minutes between regenerations (default `60`; `0` disables the cooldown). |
| `DEMO_STEP_TIMEOUT_MS` | `frontend/.env.local` | No | Max ms a spawned setup step may run before it's killed (default `600000` = 10 min). |

\* Either `ANTHROPIC_API_KEY` or `GROVE_API_KEY` must be set.

The `DEMO_*` / `DISABLE_DEMO_SETUP` variables control the data-provisioning
endpoint — see [DEMO_SECURITY.md](DEMO_SECURITY.md) for the full threat model and
the safeguards in place.

There is a **single config file** - `frontend/.env.local`. The data pipeline
(backend) reads the same `MONGODB_URI` / `DATABASE_NAME` from it, so there's
nothing to keep in sync.

## Load / refresh the data (maintainers)

The operational data is **generated in code**. The pipeline lives in
[`backend/scripts/data_pipeline/`](backend/scripts/data_pipeline/) (see its
[README](backend/scripts/data_pipeline/README.md) for the full data lineage and
options) and its committed inputs (`inputs/readings_base.csv.gz`, `network.json`,
`customer_seed.json`, `tariff_catalog.json`) are the source of truth:

- `pipeline.py` - filters/expands/synthesizes the dataset (window, meter count,
  outages, grid-stress events, and the "anchor to now" real-time offset are
  configurable in its `Config` block).
- `load_to_mongo.py` - loads the outputs into Atlas (`readings` as a time-series
  collection with `metaField=dataid`, plus secondary indexes).
- `feeder.py` - live stream on top of the seeded history (the default demo runs with it on).
- `check_seed.py` - post-load sanity checks.

To change the dataset, edit the inputs or the `Config` block, then re-run
`pipeline.py` + `load_to_mongo.py` (or `make seed_data`). The AI knowledge base
is separate - it is (re)created by `frontend/scripts/seedKnowledgeBase.mjs`,
which also builds the search indexes.

<!-- ## Run with Docker

From the repo root:

```bash
# build and start
make build

# stop and remove containers/images
make clean
``` -->

## Common errors

### Frontend

- **`Set ANTHROPIC_API_KEY ...`** - the AI assistant has no LLM credentials. Set `ANTHROPIC_API_KEY` (or `GROVE_API_KEY`) in `frontend/.env.local` and restart `npm run dev`.
- **Empty dashboards** - the data hasn't been loaded. Click **Start Demo** on the home screen, or run `make seed_data` (`pipeline.py` + `load_to_mongo.py`) plus the knowledge-base seed.
- **Old timestamps / dashboards look static** - the "real-time" window is anchored when you run `pipeline.py`. Re-run `pipeline.py` + `load_to_mongo.py` to re-anchor to now, or run `feeder.py` for a live stream.
- **AI assistant returns no sources** - the Atlas search indexes are still building, or the cluster tier is below M10 (required for Vector Search with automated embeddings).

### Data tools

- **`uv: command not found`** - install uv (see [uv docs](https://docs.astral.sh/uv/getting-started/installation/)); it runs the data pipeline and the live feeder.
- **`Set MONGODB_URI and DATABASE_NAME ...`** - the pipeline has no target. Set both in `frontend/.env.local` (the pipeline reads the same file the app does).
- **`No seeded readings found`** (feeder) - run `pipeline.py` + `load_to_mongo.py` before starting `feeder.py`.
