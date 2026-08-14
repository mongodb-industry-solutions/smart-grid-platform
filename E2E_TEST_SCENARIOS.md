# End-to-End Test Scenarios - Smart Grid Management Platform Demo

Behavior scenarios for the Smart Grid Management Platform demo, written in **Given / When / Then** form. 

Only the scenarios that materially protect the demo are listed - the critical
demo path plus the behaviors that are easy to break silently.

---

## Conventions

**Scenario ID:** `<AREA>-<NN>` - e.g. `MON-01`, `DEMO-03`.

**Priority:** `P0` (critical demo path - must never break) · `P1` (important).

**Global preconditions (unless a scenario says otherwise)**
- The database is **seeded** (a full dataset generated + loaded). The live
  **feeder** does NOT need to be running - only scenarios that explicitly test
  live polling require it.
- For Start Demo scenarios, the **backend** is running (it hosts the data pipeline):
  in the deployed app it's a sidecar in the same pod, reached over `localhost:8000`;
  locally, run it with `uv run uvicorn main:app --port 8000`. Also clear
  `sessionStorage` so the modal re-triggers. For all other scenarios the Start Demo
  modal is dismissed first.
- The app has **no auth/SSO**, so no login step is required.
- Root `/` always redirects to `/monitoring`.
- Add Outage scenarios **mutate the database** (insert a `manual_outage` reading);
  clean up those docs after each run so tests stay idempotent.

---

## 1. Start Demo & Lifecycle (`DEMO`)

- **DEMO-01** (P0): Given the database is empty and `sessionStorage` is cleared, When the user loads `/`, Then the Start Demo modal opens showing a single **Start Demo** button.
- **DEMO-02** (P0): Given the database is seeded and `sessionStorage` is cleared, When the user loads `/`, Then the modal shows **Enter the demo** and **Regenerate with today's data** (and `/api/demo/status` reported `seeded: true`).
- **DEMO-03** (P0): Given the user has dismissed the Start Demo modal, When they navigate between pages and reload with `sessionStorage` intact, Then the modal does not reappear.
- **DEMO-04** (P0): Given an empty database and the backend running, When the user clicks **Start Demo**, Then the SSE stream drives the four steps in order (generate → load → kb → feeder), ends in `done`, and the final button reads **Enter the demo**.
- **DEMO-05** (P0): Given the Start Demo run has finished (`done`), When the user clicks **Enter the demo**, Then the page reloads and `/monitoring` renders with real data.
- **DEMO-06** (P1): Given the data was generated within the cooldown window, When the user clicks **Regenerate**, Then the request is refused with `429` and a "~N min" message, and no pipeline runs.
- **DEMO-07** (P1): Given a pipeline step is forced to fail, When the user runs Start Demo, Then the stream emits `error`, the UI shows the error phase with a **Retry** action, and Retry re-runs the pipeline.

---

## 2. Navigation (`NAV`)

- **NAV-01** (P0): Given the app is running, When the user visits `/`, Then they are redirected to `/monitoring`.
- **NAV-02** (P0): Given the user is in the app, When they open each nav item in turn, Then Monitoring → `/monitoring`, Network Center → `/network-center`, Customers → `/customers`, Forecasting → `/forecasting`, and Grid Support Agent → `/ai-chatbot`, each rendering without error.

---

## 3. Monitoring Panel (`MON`)

- **MON-01** (P0): Given a seeded database, When the user opens `/monitoring`, Then Usage Change, Power Factor, Grid Stability, Outage Summary, Recent Readings, the Customer/Outage map, the Live Readings chart, and Anomalies all render with data (no empty or error states).
- **MON-02** (P0): Given the user is on `/monitoring`, When `/api/monitoring-panel/customer-locations` resolves, Then green customer markers and red outage markers appear on the US map at the seeded outage cities (2 clusters).
- **MON-03** (P1): Given the user is on `/monitoring`, When they read the Outage Summary, Then total outages, percent of customers with an outage, and the longest outage are consistent with the seeded 2 clusters.
- **MON-04** (P1): Given a seeded database, When the user opens Anomalies, Then σ-deviation rows are non-empty and no row shows an `Infinity` σ value (std = 0 guard).

---

## 4. Add Outage & Notifications (`OUT`)

- **OUT-01** (P0): Given the user is on `/monitoring`, When they click **+ Add outage**, pick a region, pick a customer, and click **Add outage**, Then the Customer select was disabled until a region was chosen, the POST returns `{ok, city, state, feeder_id, ...}`, and the modal closes.
- **OUT-02** (P0): Given an outage was just added, When ~1s passes and the `outage:added` refetch runs, Then a high-severity notification appears for the city, the bell unread badge increments, and a red marker appears (or grows) at that city.
- **OUT-03** (P1): Given the user has added an outage, When they reopen the Add Outage modal, Then the Region and Customer selects are empty (no pre-loaded last selection).
- **OUT-04** (P1): Given the Add Outage modal is open, When the user presses Escape or clicks the overlay, Then the modal closes and the body scroll lock is released.
- **OUT-05** (P1): Given `/api/customers` fails, When the user opens the Add Outage modal, Then the modal shows an error message instead of a silent empty dropdown.

---

## 5. Network Center (`NET`)

- **NET-01** (P0): Given a seeded database, When the user opens `/network-center`, Then the KPI strip, Live Demand, Peak Warnings, Grid Map, Outage Risk, Substation Health, Customers/Tariff, and Forecast-vs-Actual all render with data.
- **NET-02** (P1): Given the user is on `/network-center`, When they change the scope Select from All utilities to a specific utility, Then all panels refetch and reflect the chosen scope.
- **NET-03** (P1): Given the user is on `/network-center`, When they click a node in the Grid Map, Then the Asset Detail panel populates for that asset.

---

## 6. Customers (`CUS`)

- **CUS-01** (P0): Given a seeded database, When the user opens `/customers`, Then the list renders, the first visible customer is auto-selected, and the detail panels populate.
- **CUS-02** (P1): Given the user is on `/customers`, When they select a customer, Then Latest Reading, Profile, Consumption Trend, Tariff, Appliance Usage, Segment, and Insights all populate for that `dataid`.
- **CUS-03** (P1): Given the user is on `/customers`, When they apply a location and rate-type filter, Then the list updates, the count badge reflects the filtered total, and the selection follows the first visible row.

---

## 7. Forecasting (`FOR`)

- **FOR-01** (P0): Given a seeded database, When the user opens `/forecasting`, Then Demand Forecast, Peak Timing, Weather-Adjusted Forecast, and the Region Summary cards render with data.
- **FOR-02** (P1): Given the user is on `/forecasting`, When they pick Region then Feeder then Meter, Then selecting an upper level resets the lower ones and the charts refetch at each change.
- **FOR-03** (P1): Given a seeded database with the live feeder running (so the readings' simulated clock has advanced ahead of wall-clock time), When the user opens the Weather-Adjusted Forecast, Then the temperature line is present across both history and the forecast horizon (not blank) - real weather is shifted onto the simulated hours.

---

## 8. Grid Support Agent (`AGT`)

- **AGT-01** (P0): Given the user is on `/ai-chatbot`, When they type a question and press Enter, Then the request POSTs with a `threadId` and a response renders (markdown, module label, sources).
- **AGT-02** (P1): Given the user is on `/ai-chatbot`, When they click a preset suggestion chip, Then the question is submitted and answered just like a typed one.

---

## 9. "{ }" Show Document & "Tell me more" (`DOC`)

- **DOC-01** (P0): Given the user is on any page with a "{ }" button, When they open each one across all scopes (customers, monitoring, network, forecasting), Then each opens a populated modal with sample document(s) and the pipeline from `/api/{scope}/model`, with no failed fetch.
- **DOC-02** (P1): Given the user is on `/customers` with no customer selected, When they look at a customer-scope "{ }" button and then select a customer, Then the button is disabled with no selection and becomes enabled and populated once a customer is selected.
- **DOC-03** (P1): Given the user clicks **Tell me more!**, When the InfoWizard modal opens and they close it via Escape, the overlay, or the X, Then the tabbed modal (from `TALK_TRACK`) opens and closes all three ways and body scroll is restored.

---

## 10. API Contract & Security Guards (`API`)

Run without a browser; complements the UI scenarios.

- **API-01** (P0): Given a valid meter `dataid`, When `POST /api/monitoring-panel/outages` is called with it, Then it returns `200` with `{ok:true, dataid, city, state, feeder_id, substation_id, transformer_id}` and a `manual_outage` reading exists at the meter's latest timestamp.
- **API-02** (P0): Given a POST to a guarded endpoint (`/api/monitoring-panel/outages`, `/api/demo/start`, or the agent routes `/api/ai-chatbot` and `/api/ai-chatbot/vector-map`), When the `Origin` header is present but mismatched, Then it is rejected with `403`; and when there is no `Origin` header, the request is allowed. (The guard compares hosts, honoring `x-forwarded-host`, so it holds behind the ingress.)
- **API-03** (P1): Given a POST to `/api/monitoring-panel/outages`, When the `dataid` is non-numeric or missing, Then it returns `400` ("A numeric dataid is required."); and when the `dataid` is an unknown meter, Then it returns `404` ("No readings found…") and no document is inserted.
- **API-04** (P1): Given a POST to `/api/demo/start`, When it is sent within the cooldown window, Then it returns `429` ("~N min"); and when two are sent concurrently, Then the second returns `409` (in-progress lock).

---

## Suggested run order

1. **Smoke (P0 only):** DEMO-04/05, NAV-01/02, MON-01, OUT-01, NET-01, CUS-01, FOR-01, AGT-01, DOC-01, API-01/02. Green smoke = the demo is presentable.
2. **Core (P0 + P1):** every scenario in this document.
