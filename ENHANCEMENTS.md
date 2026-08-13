# Enhancements

Technical notes for the next team maintaining and improving this demo. These are
**deliberate future improvements** - the demo works well without them, but they're
the right next steps as the dataset grows or the demo is pushed harder.

---

## 1. Pre-aggregated rollups (Computed Pattern) - the big scalability win

### The problem

The network **demand** and **forecast** cards, and some monitoring panels, compute
their numbers by scanning and `$group`-ing the `readings` time-series **on every
request**. With the default 6 days of 15-minute data that's ~145k documents; with
a live feeder or a longer window it grows into the millions. After the
optimizations below these endpoints run comfortably under ~1 s at that size - fine
for the demo - but the cost still scales with history, so a much larger window or
higher load will degrade it. Pre-aggregated rollups turn these into
near-constant-time reads (**<100 ms**) regardless of how much history accumulates.

### What's already been done (so you don't redo it)

- **`readings` is a time-series collection with `metaField=dataid`** - buckets by
  meter, so per-meter access is fast.
- **Leaner joins via denormalization.** The grid hierarchy (`utility_id`,
  `substation_id`, `feeder_id`, `transformer_id`) **and** the region (`state`,
  `city`) are **denormalized onto every reading**. So demand and forecast run
  **join-free** as a single-collection `$match` + `$group` (see
  `lib/const/demandPipeline.js`, `lib/const/regionalForecastPipeline.js`), and
  grid-stability utilization groups by the denormalized `feeder_id` directly,
  keeping only a small join to `network` for each asset's `capacity_kw`
  (`lib/db/gridStability.js`). This is the "store together what you read together"
  principle.
- **Demand is derived from the instantaneous `power` field**, not a per-meter
  `$setWindowFields`/`$shift` over cumulative energy - much cheaper.
- **Per-interval consumption is precomputed** (`interval_kwh` on every reading,
  written by `pipeline.py`/`feeder.py`), so consumption-trend, tariff, and the
  weather forecast **sum a field** instead of diffing consecutive `energy`
  readings (no `$setWindowFields`/`$shift` at query time).
- **Bounded lookback windows** (7–14 days) on the heavy aggregates.
- **ESR-ordered compound indexes** for region drill-downs -
  `{feeder_id: 1, timestamp: 1}` and `{state: 1, timestamp: 1}` (Equality → Range),
  plus `{dataid: 1, timestamp: 1}` from the metaField for per-meter/customer reads.
  Confirmed `IXSCAN` (no `COLLSCAN`) via `explain`.
- **Anomalies use `$group` accumulators** (`$avg`/`$stdDevSamp` + the test value via
  `$max`/`$cond`) instead of `$push`-ing whole documents into per-meter arrays -
  same result, no array materialization (`lib/db/anomalies.js`).

Rollups are the next step beyond all of that.

### The idea

Maintain a **small, pre-aggregated collection** that the dashboards read instead
of scanning `readings`. Instead of grouping millions of rows per request, you read
a few hundred/thousand pre-computed rows.

Suggested collection: `demand_rollup_hourly`

```jsonc
{
  "_id": "feeder|feeder_austin_north_01|2026-08-04T15:00:00Z", // level|regionId|hourBucket
  "level": "feeder",              // "utility" | "substation" | "feeder"
  "region_id": "feeder_austin_north_01",
  "state": "Texas",
  "hour": ISODate("2026-08-04T15:00:00Z"),
  "sum_demand_kw": 812.4,         // Σ instantaneous kW across meters × intervals in the hour
  "n": 44,                        // interval-meter samples (for averaging / std)
  "sum_sq_demand_kw": 15234.1     // Σ kW² - lets you derive std without the raw rows
}
```

Store one document per **(level, region, hour)**. The dashboards then do a trivial
`$match` on `region_id` + a time range and a cheap `$group` over a handful of rows.
Expected latency: **~3 s → <100 ms**, and roughly flat as history grows.

### How to maintain it - three options

1. **Incremental upsert from the feeder (recommended, real-time).**
   Each feeder tick already writes one reading per meter for the current interval.
   In the same tick, upsert the affected rollup buckets:

   ```python
   col.update_one(
       {"_id": f"feeder|{feeder_id}|{hour_bucket}"},
       {"$inc": {"sum_demand_kw": kw, "n": 1, "sum_sq_demand_kw": kw * kw},
        "$setOnInsert": {"level": "feeder", "region_id": feeder_id,
                         "state": state, "hour": hour_bucket}},
       upsert=True,
   )
   ```

   Do the same at the `substation` and `utility` levels (or roll those up from the
   feeder rows on read). Cheapest and keeps the dashboards live. Prune old rollup
   buckets alongside the feeder's `--retain-days` window.

2. **Scheduled materialized view via `$merge`.**
   Run the existing demand `$group` periodically (cron / Atlas Scheduled Trigger)
   and `$merge` the result into `demand_rollup_hourly`. Simpler to reason about,
   eventually consistent, no feeder coupling. Good if the feeder isn't always on.

3. **Change stream → rollup service.**
   A worker tails a change stream on `readings` and updates rollups as inserts
   land. Most "production-shaped", most moving parts. Overkill for the demo.

### Query changes

`lib/db/demandForecast.js` and `lib/db/regionalForecast.js` would read
`demand_rollup_hourly` (filter by `region_id`/`level` + hour range) instead of
building the `readings` aggregation. Keep the current `readings`-based pipeline as
a fallback for regions/levels with no rollup yet, or for ad-hoc queries.

### Trade-offs / gotchas

- **Eventual consistency.** Rollups lag the raw data slightly (fine for dashboards).
- **Regeneration.** When the dataset is re-seeded (Start Demo / `pipeline.py`), drop
  and rebuild the rollups, or backfill them once with option 2's `$merge` job.
- **Bucket boundaries & retention.** Keep the rollup retention aligned with the
  feeder's `--retain-days` so you don't accumulate orphan buckets.
- **std dev.** Store `sum_sq_demand_kw` and `n` so you can compute variance without
  the raw rows: `var = sum_sq/n − (sum/n)²`.

---

## 2. Extended Reference for customer / tariff joins

Where a `$lookup` is still genuinely needed (e.g. customer profile or tariff on the
customers views), prefer the **Extended Reference** pattern: denormalize just the
few fields you actually read (`utilityName`, `rateName`, `city`) onto the document
that needs them, rather than looking up the whole related document at query time.
Accept the small duplication; these fields change rarely.

---

## 3. Tiering / archival for very long histories

If the demo ever runs with months of history + a always-on feeder, consider Atlas
**Online Archive** (or a manual cold collection) for readings older than the active
dashboard window, so the hot `readings` collection stays small. The feeder's
`--retain-days` already caps it for demo purposes; this is only relevant if you
want to *keep* long history queryable without bloating the hot path.

---

## 4. Weather temperature source (archive + sim-clock shift)

The weather-adjusted forecast pulls temperatures from Open-Meteo's **archive** API
(`lib/weather/openMeteo.js`), which only covers dates up to *today*. Two things
push the readings' timestamps past that: the dataset is anchored to "now", and the
live feeder advances a **simulated clock** ahead of wall-clock time, so `to` and
the forecast horizon can sit days/weeks in the future - where the archive has no
data, which would blank the temperature line.

`lib/db/weatherForecast.js` handles this by **shifting** the requested window back
onto real dates the archive covers, fetching there, then re-keying the temps
forward onto the sim hours (`shiftHourKey`). This keeps the line populated across
both history and the horizon regardless of how far the feeder has drifted. It
trades exact calendar temperature for continuity - fine here, since the demo
readings aren't weather-driven. If you ever want *true* calendar temperatures for
the near-future horizon instead, fetch it from Open-Meteo's **forecast** endpoint
(`api.open-meteo.com/v1/forecast`, up to ~16 days ahead) and merge - but that
still can't cover a sim clock that has run far past +16 days.

---

## 5. Extract the live feeder into its own API (separate repo, reusable across Energy demos)

### The problem

The feeder (`feeder.py`) now runs in the **backend** service: `backend/main.py`
spawns and tracks it, and the frontend drives it through the backend's
`/demo/feeder/*` endpoints (`lib/demo/feeder.js` is a thin HTTP client). That
already fixed the worst of the original design (the Next.js app no longer shells
out to a local process). What's left is that it's still **coupled to this repo**
and its lifecycle is still **in-process in the backend**, so any other Energy demo
that wants a live smart-meter stream would have to copy the code. Remaining limits:

- **State doesn't survive a backend restart.** The process handle lives in a module
  global in `backend/main.py`, so a restart orphans the running feeder (it keeps
  writing, but the backend can no longer see or stop it - only its `--max-hours`
  guard eventually ends it).
- **It doesn't work across instances.** Each backend replica has its own in-memory
  handle, so `feeder/status` and `feeder/stop` only know about the local one.
- **It isn't reusable.** The streaming logic lives inside smart-grid-platform; other demos
  can't consume it without duplicating it.

### The idea

Pull the feeder out into **its own standalone repository and API** - a small,
independently deployed streaming service that owns the data-generation loop and
its state. The smart-grid demo (and any other Energy demo) becomes a **client**
of it.

- Expose `POST /feeder/start`, `POST /feeder/stop`, `GET /feeder/status`.
- **Parameterize it** so it isn't smart-grid-specific: the caller supplies the
  target connection/database/collection, cadence (`tick`, `interval`), retention,
  and dataset shape. That's what lets it serve multiple demos, each pointed at its
  own cluster.
- Run the loop as a managed background task inside the service (not a detached
  child process), and persist its state (running flag, sim clock) in its own store
  or the target DB, so status is authoritative and survives restarts / instances.

In this repo the plumbing is already close: `lib/demo/feeder.js` is an HTTP client
and `demo/start` orchestrates generate → load → seed KB → start feeder. The step
is to point that client at the **standalone** service instead of this demo's own
backend, and move the backend's in-process feeder subprocess (and its `demo/feeder/*`
endpoints) into that service, persisting state so status survives restarts/instances.

### Why it's worth it

- **Reusable across Energy demos** - a shared "live smart-meter / telemetry
  stream" capability that any demo consumes by pointing it at their own cluster,
  instead of copy-pasting `feeder.py`.
- **Independent maintenance & versioning** - the feeder evolves and deploys on its
  own cadence, decoupled from the smart-grid-platform app's release cycle.
- **Robust lifecycle & deploys anywhere** - one authoritative owner; no orphans;
  works on serverless/multi-instance hosting where spawning local processes doesn't.
- **Cleaner separation** - data generation is a shared platform service, not
  something the web tier shells out to.

### How to approach it

Lift `feeder.py` + its state management into the new repo behind the three
endpoints, keep the API contract stable and **generic** (no smart-grid
assumptions in the payloads), then swap this demo's subprocess handling for HTTP
calls. Trade-off: it adds a service to run and an API contract to keep stable
across consumers - worth it once more than one demo needs the stream, or the demo
is deployed and must survive restarts.

---

## 6. Scale the dataset back up (streamed loading + memory)

### Background

The generator (`pipeline.py`) builds every reading as a dict in a Python list in
RAM (`docs`), because the post-processing steps (grid topology assignment, grid
stress, outage summary) operate on the whole set. That list is the peak-memory
driver. The window is trimmed to **6 days** × 15-min × 250 meters (~145k readings)
so the backend pod (512Mi) doesn't get **OOMKilled** during Start Demo.

### What's already been done (streamed I/O)

Readings are exported and loaded as a stream, so neither side holds the full set
beyond the generator's working list:

- `pipeline.py` writes readings to **JSON Lines** (`readings_final.jsonl`), one
  sanitized doc per line, streamed.
- `load_to_mongo.py` **streams** that file line-by-line and `insert_many`s in
  batches (`BATCH`), so it never holds all readings at once (and emits steady
  progress, which also keeps the streaming HTTP response alive).

This keeps the load step flat in memory and the export peak low.

### If you need a bigger window (more history)

`pipeline.py` still holds the single `docs` list during generation (the
post-processing needs it), so memory still scales with `DURATION`. To go well
beyond 6 days you have two levers:

- **Stream generation too (durable fix).** Make `synthesize` (and the grid
  topology / stress / summary passes) operate per-meter and append each meter's
  readings to the JSONL file as they're produced, so `docs` never holds the whole
  set. More involved because a few passes currently scan all readings at once.
- **Raise the pod memory (stopgap).** Bump the backend's `resources.limits.memory`
  in `.drone.yml` (`deploy-backend-*`) - roughly `1Gi` for ~14 days, `2Gi` for ~30
  days - and raise `DURATION` accordingly. Simplest, but it just moves the ceiling.
