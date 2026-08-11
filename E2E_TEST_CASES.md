# End-to-End Test Cases - Smart Meter Demo

This document specifies the **E2E test cases** worth building for the Smart Meter
demo frontend. It is a planning artifact: it defines *what* to test and the
*expected behavior*, not the test code itself. Each case is automatable (e.g.
Playwright) against a seeded environment.

Only the cases that materially protect the demo are listed - the critical demo
path plus the behaviors that are easy to break silently.

---

## 1. Conventions

**Test ID format:** `<AREA>-<NN>` - e.g. `MON-01`, `DEMO-03`.

**Priority:** `P0` (critical demo path - must never break) · `P1` (important).

**Global preconditions (unless a case says otherwise)**
- The database is **seeded** (a full dataset generated + loaded). The live
  **feeder** does NOT need to be running - only the cases that explicitly test
  live polling require it, and they say so.
- `sessionStorage` is **cleared** before each Start-Demo case so the modal
  re-triggers; for all other cases the Start Demo modal is dismissed first.
- The app has **no auth/SSO**, so no login step is required.
- Root `/` always redirects to `/monitoring`.
- The Add Outage cases **mutate the database** (insert a `manual_outage`
  reading); clean up those docs after each run so tests stay idempotent.

---

## 2. Start Demo & Lifecycle (`DEMO`)

Component: `components/demo/DemoStartModal.js` · APIs: `GET /api/demo/status`,
`POST /api/demo/start` (SSE).

| ID | Priority | Title | Steps | Expected result |
|----|----------|-------|-------|-----------------|
| DEMO-01 | P0 | Modal shows on first visit (empty DB) | Clear `sessionStorage`; empty DB; load `/`. | Modal opens with a single **Start Demo** button. |
| DEMO-02 | P0 | Modal shows "seeded" layout | Clear `sessionStorage`; seeded DB; load `/`. | Modal shows **Enter the demo** + **Regenerate with today's data**; `/api/demo/status` returned `seeded:true`. |
| DEMO-03 | P0 | Modal appears once per session | Dismiss the modal; navigate; reload with `sessionStorage` intact. | Modal does **not** reappear (`demoModalSeen` guard). |
| DEMO-04 | P0 | Start Demo runs full pipeline | Empty DB; click **Start Demo**. | SSE stream drives the 4 steps in order **generate → load → kb → feeder**; ends in `done`; final button is **Enter the demo**. |
| DEMO-05 | P0 | "Enter the demo" loads a seeded app | From `done`, click **Enter the demo**. | Full page reload; `/monitoring` renders with real data. |
| DEMO-06 | P1 | Regenerate cooldown | Seeded < cooldown window ago; click **Regenerate**. | Returns **429** with a "~N min" message; UI shows the error, no pipeline runs. |
| DEMO-07 | P1 | Error phase + Retry | Force a pipeline step to fail. | Stream emits `error`; UI shows error phase with **Retry**; Retry re-runs. |

---

## 3. Navigation (`NAV`)

| ID | Priority | Title | Steps | Expected result |
|----|----------|-------|-------|-----------------|
| NAV-01 | P0 | Root redirect | Visit `/`. | Redirects to `/monitoring`. |
| NAV-02 | P0 | Nav visits all 5 sections | Open each nav item. | Monitoring → `/monitoring`; Network Center → `/network-center`; Customers → `/customers`; Forecasting → `/forecasting`; Grid Support Agent → `/ai-chatbot`. Each renders without error. |

---

## 4. Monitoring Panel (`MON`)

Route: `/monitoring`.

| ID | Priority | Title | Steps | Expected result |
|----|----------|-------|-------|-----------------|
| MON-01 | P0 | Page loads all cards | Open `/monitoring`. | Usage Change, Power Factor, Grid Stability, Outage Summary, Recent Readings, Customer/Outage map, Live Readings chart, Anomalies all render with data (no empty/error states). |
| MON-02 | P0 | Map renders markers | Wait for `/api/monitoring-panel/customer-locations`. | Green customer + red outage markers appear at the seeded outage cities (2 clusters). |
| MON-03 | P1 | Outage Summary numbers | Read the Outage Summary. | Total outages, % customers with an outage, and longest outage are consistent with the seeded 2 clusters. |
| MON-04 | P1 | Anomalies list is valid | Open Anomalies. | Non-empty σ-deviation rows; **no `Infinity` σ values** (std=0 guard). |

---

## 5. Add Outage & Notifications (`OUT`)

Components: `AddOutageModal.js`, `customerMap.js`, notifications. API:
`POST /api/monitoring-panel/outages`. **These cases mutate data.**

| ID | Priority | Title | Steps | Expected result |
|----|----------|-------|-------|-----------------|
| OUT-01 | P0 | Full add-outage happy path | On `/monitoring`, click **+ Add outage**; pick a region → a customer → **Add outage**. | Modal opens (Customer disabled until a region is picked); POST returns `{ok, city, state, feeder_id, ...}`; modal closes. |
| OUT-02 | P0 | Notification + red marker appear | After OUT-01, wait ~1s / for the `outage:added` refetch. | A high-severity notification appears for the city; bell badge increments; a red marker appears/grows at that city. |
| OUT-03 | P1 | Form resets on reopen | Add an outage; reopen the modal. | Region and Customer are **empty** (no pre-loaded last selection). |
| OUT-04 | P1 | Escape / overlay closes modal | Open modal; press Escape; reopen; click the overlay. | Closes both ways; body scroll lock is released on close. |
| OUT-05 | P1 | Customer-load failure surfaced | Force `GET /api/customers` to fail; open modal. | Modal shows an error message, not a silent empty dropdown. |

---

## 6. Network Center (`NET`)

Route: `/network-center`.

| ID | Priority | Title | Steps | Expected result |
|----|----------|-------|-------|-----------------|
| NET-01 | P0 | Page loads all panels | Open `/network-center`. | KPI strip, Live Demand, Peak Warnings, Grid Map, Outage Risk, Substation Health, Customers/Tariff, Forecast-vs-Actual all render with data. |
| NET-02 | P1 | Scope select drives panels | Change the scope Select (All utilities → a specific utility). | All panels refetch and reflect the chosen scope. |
| NET-03 | P1 | Grid Map node → Asset Detail | Click a node in the Grid Map. | The **Asset Detail** panel populates for that asset. |

---

## 7. Customers (`CUS`)

Route: `/customers`.

| ID | Priority | Title | Steps | Expected result |
|----|----------|-------|-------|-----------------|
| CUS-01 | P0 | List loads & auto-selects | Open `/customers`. | List renders; first visible customer auto-selected; detail panels populate. |
| CUS-02 | P1 | Detail panels for a selection | Select a customer. | Latest Reading, Profile, Consumption Trend, Tariff, Appliance Usage, Segment, Insights all populate for that `dataid`. |
| CUS-03 | P1 | Filters narrow the list | Apply a location + rate-type filter. | List updates; count badge reflects the total; selection follows the first visible row. |

---

## 8. Forecasting (`FOR`)

Route: `/forecasting`.

| ID | Priority | Title | Steps | Expected result |
|----|----------|-------|-------|-----------------|
| FOR-01 | P0 | Page loads charts | Open `/forecasting`. | Demand Forecast, Peak Timing, Weather-Adjusted Forecast, Region Summary cards render with data. |
| FOR-02 | P1 | Cascading filters | Pick Region → Feeder → Meter. | Selecting an upper level **resets** the lower ones; charts refetch at each change. |

---

## 9. Grid Support Agent (`AGT`)

Route: `/ai-chatbot`. API: `POST /api/ai-chatbot`.

| ID | Priority | Title | Steps | Expected result |
|----|----------|-------|-------|-----------------|
| AGT-01 | P0 | Ask a question end-to-end | Type a question; press Enter. | Request POSTs with a `threadId`; a response renders (markdown, module label, sources). |
| AGT-02 | P1 | Suggestion chip sends | Click a preset suggestion chip. | The question is submitted and answered like a typed one. |

---

## 10. "{ }" Show Document & "Tell me more" (`DOC`)

Components: `ShowDocButton.js`, `DataModelModal.js`, `InfoWizard.js`.

| ID | Priority | Title | Steps | Expected result |
|----|----------|-------|-------|-----------------|
| DOC-01 | P0 | Show-document modals open | Iterate the "{ }" buttons across all pages (scopes: customers, monitoring, network, forecasting). | Each opens a populated modal with sample doc(s) + pipeline from `/api/{scope}/model`; no failed fetch. |
| DOC-02 | P1 | Customer-scope button gating | On `/customers` with no selection, then with one. | Button disabled with no customer selected; enabled and populated once one is selected. |
| DOC-03 | P1 | "Tell me more!" opens & closes | Click **Tell me more!**; close via Escape / overlay / X. | Tabbed InfoWizard modal opens (from `TALK_TRACK`) and closes all three ways; body scroll restored. |

---

## 11. API Contract & Security Guards (`API`)

Run without a browser; complements the UI cases.

| ID | Priority | Title | Steps | Expected result |
|----|----------|-------|-------|-----------------|
| API-01 | P0 | Add outage - valid | `POST /api/monitoring-panel/outages` with a valid `{dataid}`. | 200 with `{ok:true, dataid, city, state, feeder_id, substation_id, transformer_id}`; a `manual_outage` reading exists at the meter's latest timestamp. |
| API-02 | P0 | Same-origin guard | POST `/api/monitoring-panel/outages` and `/api/demo/start` with a mismatched `Origin`. | **403**; a request with no Origin is allowed. |
| API-03 | P1 | Add outage - bad input | POST with a non-numeric/missing `dataid`, then an unknown meter. | **400** "A numeric dataid is required."; **404** "No readings found…"; no doc inserted. |
| API-04 | P1 | Demo start guards | POST `/api/demo/start` within cooldown, then twice concurrently. | **429** (cooldown "~N min") and **409** (in-progress lock). |

