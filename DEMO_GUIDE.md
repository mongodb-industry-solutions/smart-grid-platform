# Smart Meter Demo — Intern Guide

A practical reference for building and presenting this fullstack demo as a MongoDB industry solutions template.

---

## What This Template Is

This is a **smart meter dashboard** — a demo showing how energy companies can store, query, and analyze time-series meter readings using MongoDB Atlas. It ships with two runnable services:

| Service | Tech | Port | Responsibility |
|---|---|---|---|
| **Backend** | Python + FastAPI | 8000 | REST API, MongoDB queries, AI/embeddings |
| **Frontend** | Next.js 15 + React 19 | 3000 | Dashboard UI, direct MongoDB reads via API routes |

The app connects to a MongoDB Atlas cluster where smart meter readings live in a **time-series collection** — one of the Atlas features you'll be demoing.

---

## Architecture

```
Browser (localhost:3000)
        │
        ▼
  Next.js Frontend
  ┌─────────────────────────────────────┐
  │  app/page.js                        │
  │  └─ components/live-readings.js     │
  │       └─ fetch("/api?limit=10")     │
  │                                     │
  │  app/api/route.js  ◄─── Next.js     │
  │  └─ lib/mongodb.js     API Route    │
  └──────────────┬──────────────────────┘
                 │
                 ▼
         MongoDB Atlas
         ┌─────────────────────┐
         │  DB: smart_meter    │
         │  Collection:        │
         │    readings (TSC)   │
         └─────────────────────┘
                 ▲
                 │
  Python FastAPI Backend (localhost:8000)
  ┌─────────────────────────────────────┐
  │  main.py                            │
  │  └─ db/mdb.py  MongoDBConnector     │
  │  └─ bedrock/   AWS AI services      │
  └─────────────────────────────────────┘
```

**Important:** Right now both the frontend (via Next.js API routes) and the backend (via FastAPI) can independently query MongoDB. For a clean demo, pick one path per feature — don't mix them.

---

## Tech Stack Crash Course

If you're new to any of these, here's what you need to know:

### Next.js (frontend)
- React framework. Files in `app/` are pages and API routes (App Router pattern).
- Files with `"use client"` at the top run in the browser. Everything else runs on the server.
- `app/api/route.js` is a **server-side API route** — it runs on Node.js, so it can safely hold your `MONGODB_URI`.
- Path alias `@/` maps to the `frontend/` root (configured in `jsconfig.json`).

### FastAPI (backend)
- Python REST framework. Routes are defined as functions with decorators like `@app.get("/api/readings/recent")`.
- Started with `uvicorn main:app --reload` from the `backend/` directory.
- Uses `pymongo` to talk to MongoDB.

### MongoDB Atlas
- Hosted MongoDB. The connection string (`MONGODB_URI`) is the only thing that changes between local and Atlas.
- The `readings` collection is a **time-series collection** — optimized for sequential, timestamped data.
- You can add **vector search indexes** on top to enable semantic search over readings or documents.

### LeafyGreen UI
- MongoDB's official React component library. Used for buttons, tables, modals, etc. Already wired up in `app/providers.js`.

---

## Setup: Getting It Running Locally

### 1. MongoDB Atlas cluster
1. Create a free M0 cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. Create a database user and whitelist your IP
3. Copy the connection string — it looks like: `mongodb+srv://user:pass@cluster.mongodb.net/`

### 2. Create the database and collection
In Atlas Data Explorer (or mongosh):

```js
use smart_meter

db.createCollection("readings", {
  timeseries: {
    timeField: "timestamp",
    metaField: "dataid",
    granularity: "minutes"
  },
  expireAfterSeconds: 2592000  // 30 days
})
```

Or run the helper script that's already in the project:
```bash
cd backend
python _timeseries_coll_creator.py
```

### 3. Seed sample data
The readings documents should look like this:

```json
{
  "timestamp": { "$date": "2024-01-15T10:30:00Z" },
  "dataid": "meter-001",
  "avg_reading": 230.5,
  "volt_leg_1": 118.2,
  "volt_leg_2": 112.3
}
```

You can insert test data from mongosh:
```js
db.readings.insertMany([
  { timestamp: new Date(), dataid: "meter-001", avg_reading: 230.5, volt_leg_1: 118.2, volt_leg_2: 112.3 },
  { timestamp: new Date(Date.now() - 60000), dataid: "meter-002", avg_reading: 229.1, volt_leg_1: 115.0, volt_leg_2: 114.1 }
])
```

### 4. Environment variables

**Frontend** — create `frontend/.env.local`:
```
MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/"
DATABASE_NAME="smart_meter"
```

**Backend** — create `backend/.env`:
```
MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/"
DATABASE_NAME="smart_meter"
APP_NAME="smartmeters"
```

### 5. Start the services

**Backend:**
```bash
cd backend
pip install uv        # if you don't have it
uv sync
uvicorn main:app --reload --port 8000
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you should see the dashboard with readings.

---

## Codebase Map

```
smart-meter/
├── backend/
│   ├── main.py                          ← FastAPI app entry point, define routes here
│   ├── db/mdb.py                        ← MongoDBConnector class (reuse this)
│   ├── bedrock/
│   │   ├── client.py                    ← AWS Bedrock base client
│   │   ├── anthropic_chat_completions.py← Claude 3 Haiku via Bedrock
│   │   └── cohere_embeddings.py        ← Cohere embeddings via Bedrock
│   ├── _timeseries_coll_creator.py      ← One-time setup script
│   └── _vector_search_idx_creator.py   ← One-time setup script
│
└── frontend/
    ├── app/
    │   ├── page.js                      ← Home page — edit this to add components
    │   ├── api/route.js                 ← Next.js API route — queries MongoDB
    │   └── providers.js                 ← LeafyGreen theme provider
    ├── components/
    │   ├── live-readings.js             ← Readings table component
    │   └── infoWizard/InfoWizard.js     ← Demo talk track modal
    └── lib/
        ├── mongodb.js                   ← MongoDB client (singleton, safe for Next.js)
        └── const/talkTrack.js          ← Text content for the InfoWizard
```

---

## Building the Demo: Step-by-Step Roadmap

### Phase 1 — Foundation (Day 1–2)
**Goal:** Data flowing end-to-end, visible on screen.

- [ ] Atlas cluster running with real or synthetic readings data
- [ ] Both services start without errors
- [ ] `RecentReadings` table shows live data from MongoDB
- [ ] Understand the data model — what fields does a reading have?

**Key files:** `app/api/route.js`, `components/live-readings.js`, `db/mdb.py`

---

### Phase 2 — Core Features (Day 3–5)
**Goal:** A dashboard that tells a real story.

Pick 2–3 features from this list and build them:

**Aggregations panel**
- Show energy consumption over time (hourly/daily averages)
- MongoDB's aggregation pipeline is the story here — `$group`, `$dateAdd`, `$avg`
- Add a backend route: `GET /api/readings/aggregate?period=hourly`

**Real-time updates**
- Poll the API every few seconds to simulate live meter readings
- In `live-readings.js`, add a `setInterval` inside `useEffect`

**Filtering by meter ID**
- Add a dropdown to filter by `dataid`
- Pass a query param: `/api?dataid=meter-001&limit=10`
- On the backend: `db.find({"dataid": dataid})`

**Charts**
- Use a chart library (Recharts, Chart.js) to visualize readings over time
- Install: `npm install recharts`

---

### Phase 3 — MongoDB Atlas Features (Day 5–7)
**Goal:** Highlight Atlas-specific capabilities for the demo narrative.

**Time-series collection demo**
- Show the collection type in Atlas UI during the presentation
- Explain: automatic bucketing, compression, efficient range queries on `timestamp`
- Benchmark a time-range query: `db.readings.find({ timestamp: { $gte: start, $lte: end } })`

**Atlas Charts integration** (optional, high impact)
- Build a chart in Atlas Charts, embed the iframe in the Next.js app
- Zero-code analytics story — very compelling for demos

**Vector search** (if time allows)
- Use `_vector_search_idx_creator.py` to create an index
- Generate embeddings for readings summaries using `bedrock/cohere_embeddings.py`
- Build a semantic search endpoint: "find anomalous readings" → vector similarity search

**Atlas Search** (text search alternative)
- Create a search index on the `dataid` field
- Add a search bar to the frontend

---

### Phase 4 — Polish & Presentation (Day 7–8)
**Goal:** Demo-ready.

- [ ] Wire up the `InfoWizard` component in `page.js` — it has the talk track built in
  ```js
  // In app/page.js — uncomment this:
  import InfoWizard from "@/components/infoWizard/InfoWizard";
  ```
- [ ] Update `lib/const/talkTrack.js` with your narrative (problem → MongoDB solution → demo)
- [ ] Add error states and loading skeletons (don't let the demo break on an empty collection)
- [ ] Test with an audience member driving — they will click things you didn't expect

---

## Best Practices

### MongoDB connection
- **Never** create a new `MongoClient` on every request — it's expensive and will exhaust your Atlas connection limit. The singleton pattern in `lib/mongodb.js` handles this correctly.
- In Next.js development, use `global._mongoClientPromise` to survive hot reloads (already done in `lib/mongodb.js`).
- In FastAPI, the `MongoDBConnector` instance in `main.py` lives for the life of the process — same principle.

### Environment variables
- **Never** commit `.env` or `.env.local`. Both are in `.gitignore`.
- The pre-commit hook in `.githooks/` will scan for secrets — run `./setup-hooks.sh` once to install it.
- For Atlas: use a **dedicated demo user** with read-only permissions. Don't use your admin credentials.

### API design
- You currently have two ways to query MongoDB: the Next.js API route (`/api`) and the FastAPI backend (`localhost:8000`). For the demo, use the Next.js API route for simple reads and the FastAPI backend for anything that needs Python (embeddings, heavy aggregations). Avoid duplicating the same query in both.
- Add `?limit=` params to every list endpoint — you don't want to accidentally stream 10M documents.

### Data model
- The `dataid` field is the **metaField** of the time-series collection. Put anything that identifies the meter (meter ID, location, customer) in `dataid` as a string or sub-document.
- Don't change the `timeField` name after creating the collection — it's locked in.
- Readings are immutable — don't update them. If a reading was wrong, insert a corrected one with the same `dataid` and a new `timestamp`.

### Frontend
- Keep `"use client"` only on components that need browser APIs or interactivity. API routes (`app/api/`) and server components should never have it.
- Use LeafyGreen components (`@leafygreen-ui/*`) for tables, buttons, and modals — they match MongoDB's brand and are already installed.
- For production, replace hardcoded `localhost:8000` URLs with an environment variable (`NEXT_PUBLIC_API_URL`).

---

## MongoDB Atlas Features to Highlight in the Demo

| Feature | Where it lives | What to show |
|---|---|---|
| **Time-series collections** | Atlas Data Explorer → Collection → Options | Show the `timeseries` metadata, explain automatic compression |
| **Aggregation pipeline** | Atlas Data Explorer → Aggregations tab | Build a `$group` + `$avg` pipeline visually |
| **Indexes** | Atlas Data Explorer → Indexes tab | Show the automatic `_id` + `timestamp` indexes |
| **Atlas Charts** | Charts tab in Atlas | Embed a live line chart of readings |
| **Vector Search** | Atlas Search → Indexes | If you added embeddings, demo semantic search |
| **Performance Advisor** | Atlas → Performance Advisor | Show suggested indexes (works well with a seeded dataset) |

---

## Common Issues

**"MongoServerError: bad auth"** — Wrong username/password in `MONGODB_URI`, or the user doesn't have access to the database.

**"MONGODB_URI environment variable is required but not set"** — You're missing `.env.local` (frontend) or `.env` (backend). Copy from the example files.

**Frontend shows empty table** — Check that the `readings` collection has documents. Run the seed query from the Setup section.

**CORS errors in browser** — The FastAPI backend allows `localhost:3000` by default (set in `main.py`). If you change the frontend port, add it to the `origins` list.

**Hot reload resets MongoDB connection** — This is handled by `global._mongoClientPromise` in `lib/mongodb.js`. If you see connection pool warnings during dev, this is normal.
