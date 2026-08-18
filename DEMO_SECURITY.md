# Demo setup endpoint - security notes

Technical reference for the `/api/demo/*` routes that power the **Start Demo**
modal. These endpoints are more sensitive than a typical web route: they trigger OS processes (in the backend) and drop/reload MongoDB collections. This document is the threat model and the safeguards in place, for reviewers and for the next team.

**Architecture.** The Python data pipeline (generate / load / feeder) runs in a
**backend sidecar** (which has Python + `uv`) deployed in the **same pod** as the
frontend; the frontend `/api/demo/*` routes **orchestrate** it - forwarding the
pipeline steps to the backend over **`localhost`** (`BACKEND_URL`, shared network
namespace) and streaming progress back to the browser. The only step the frontend
still spawns locally is the Node knowledge-base seed. The backend demo endpoints
(`/demo/generate`, `/demo/load`, `/demo/feeder/*`) have **no Service or ingress of
their own** - they listen only on the pod's loopback, so nothing outside the pod
(let alone the public internet) can reach them.

## What the endpoints do

| Route | Method | Effect |
| --- | --- | --- |
| `/api/demo/status` | GET | Read-only: reports whether data is seeded, the readings count, last-generated date, and whether the feeder is running. |
| `/api/demo/start` | POST | **Privileged.** Forwards `generate` + `load` (+ optional `feeder`) to the backend and spawns `node seedKnowledgeBase.mjs` locally. **Drops and reloads** the operational collections. |
| `/api/demo/stop` | POST | Stops the live feeder (via the backend). |

`/api/demo/start` is the sensitive one - it both **destroys/regenerates data** and
**runs processes** (in the backend).

## Threat model

### What an attacker CANNOT do (by design)

- **No command injection / RCE.** The commands and their arguments are
  **hardcoded** on both sides - the frontend's local Node step and the backend's
  `uv` subprocesses. The only value read from the request body is a boolean
  (`feeder`); it never flows into a command, path, or shell. Processes are spawned
  without a shell (`spawn` without `shell: true`; Python `create_subprocess_exec` /
  `Popen` with a list, no `shell=True`), so there is no shell interpolation. This
  removes the most dangerous class of attack for a "run a process" endpoint.
- **No credential exposure.** The streamed output is pipeline stdout/stderr
  (progress + absolute paths). It contains no secrets; connection strings and API
  keys are never logged.

### Threats - and how they're mitigated

Without any controls an unauthenticated caller could do the following; each is
already addressed (numbers reference the safeguards below):

- **Data destruction / disruption** - regenerate/drop collections mid-demo.
  *Mitigated by* SSO on the hosted demo (authenticated users only), the cooldown
  (#4), and the concurrency lock (#3). The data is regenerable, so there's no
  permanent loss.
- **Denial of service** - repeatedly trigger the ~2–3 min generation to burn
  CPU/IO. *Mitigated by* the cooldown / rate-limit (#4), the concurrency lock
  (#3, one run at a time), and the per-step timeout (#5) - and behind SSO only
  authenticated users can reach it at all.
- **Cross-site drive-by (CSRF)** - a malicious page POSTing from a visitor's
  browser. *Mitigated by* the same-origin guard (#2); behind SSO the endpoint
  isn't reachable cross-site anyway.
- **Direct hit on the process-running backend** - calling the pipeline endpoints
  straight, bypassing the frontend guards. *Mitigated by* backend isolation (#8):
  those endpoints have no public ingress, so they're only reachable from inside the
  cluster.

Residual severity: **low** on the maintained (SSO-gated, internal-backend)
deployment; **moderate** only for a public self-hosted copy that exposes the
backend and adds no authentication of its own.

## Safeguards in place

The orchestration lives in `frontend/app/api/demo/start/route.js`; the backend
pipeline endpoints and feeder process handling live in `backend/main.py`; the
frontend's backend client is `frontend/lib/demo/feeder.js`; the same-origin guard
is the shared helper `frontend/lib/http/sameOrigin.js`.

1. **No untrusted input reaches the shell.** Fixed command + args on both sides;
   spawned without a shell. This is the primary control.

2. **Same-origin guard (anti-CSRF).** A request whose `Origin` header is present
   but does **not** match the app's host is rejected with `403`. Requests with no
   `Origin` (curl / server-to-server automation) are allowed. It compares **hosts**
   (honoring `x-forwarded-host`) rather than full origins, so it works behind a
   TLS-terminating ingress. It's a shared helper (`lib/http/sameOrigin.js`) applied
   to **every** POST endpoint, including the AI-agent routes (`/api/ai-chatbot`,
   `/api/ai-chatbot/vector-map`) - the most expensive endpoints. This blocks
   cross-site browser triggers while keeping tooling usabl\e.

3. **Concurrency lock.** A module-level flag (surviving dev hot-reload via
   `globalThis`) rejects overlapping runs with `409`. This also prevents the
   drop+create race that could otherwise corrupt the `readings` time-series
   collection (a running feeder writing mid-reload can recreate it as a plain
   collection). The feeder is also explicitly stopped before the reload.

4. **Cooldown / rate-limit.** Regeneration is refused with `429` if the last run
   (tracked in `demo_meta.generatedAt`) was more recent than
   `DEMO_REGEN_COOLDOWN_MINUTES` (default **60**). Since the data is anchored to
   "now" at generation time, there's no reason to rebuild more often - this blocks
   both accidental double-clicks and abusive repeats.

5. **Per-step process timeout.** Each step is killed if it exceeds
   `DEMO_STEP_TIMEOUT_MS` (default **600000** = 10 min), so a hung or stuck process
   can't run forever. Note the enforcement point: the Python steps (`generate` /
   `load`) are now killed by the **backend** (which reads its own
   `DEMO_STEP_TIMEOUT_MS`), while the frontend's `DEMO_STEP_TIMEOUT_MS` covers only
   the local KB step. To retune the pipeline timeout, set the variable on the
   **backend** service, not just `frontend/.env.local`.

6. **Feeder lifecycle limits.** The feeder itself (`feeder.py`) has built-in
   guards independent of the API: `--retain-days` (a rolling retention window so
   the collection can't grow unbounded) and `--max-hours` (auto-stop so an
   orphaned feeder can't run forever). `stopFeeder` terminates the detached
   process group (POSIX) with a Windows-safe fallback.

7. **Query timeout (app-wide).** The MongoDB client sets a per-operation timeout
   (`timeoutMS`, `MONGODB_TIMEOUT_MS`, default 20 s) in `lib/mongodb.js`, so the
   server aborts any query/aggregation that runs too long. This isn't specific to
   the setup endpoint - it protects **every** request (including this endpoint's
   cooldown check) from a slow or runaway query hanging the app.

8. **Backend isolation.** The pipeline processes run in a **backend sidecar** in
   the same pod as the frontend, listening only on the pod's **loopback** - it has
   **no Service or ingress**. So the process-running endpoints are unreachable from
   anywhere outside the pod; only the frontend (same network namespace) can call
   them over `localhost`.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DEMO_REGEN_COOLDOWN_MINUTES` | `60` | Minimum minutes between regenerations; `0` disables the cooldown (useful while developing). |
| `MONGODB_TIMEOUT_MS` | `20000` | Per-operation MongoDB timeout; any query exceeding it is aborted (app-wide). |
| `DEMO_STEP_TIMEOUT_MS` | `600000` | Max runtime per pipeline step before it's killed (read by the frontend's local KB step and the backend's `uv` steps). |
| `BACKEND_URL` | `http://localhost:8000` | Internal URL of the backend service the pipeline runs in. |

## Deployment guidance

This repo has two very different audiences, with different risk profiles:

- **The maintained demo (MongoDB-hosted, behind SSO).** The platform's
  authentication (e.g. Kanopy SSO) gates the whole app, so the setup endpoint is
  only reachable by authenticated users - it inherits that protection, and the
  safeguards above are defense-in-depth. This is the deployed posture.
- **A cloned copy (someone using this repo as a base).** The project is open and
  reproducible: a third party runs it against **their own** Atlas cluster and
  credentials. None of MongoDB's infrastructure, credentials, or SSO are involved,
  so there is **no exposure on our side** - the cloner owns their environment. If
  they deploy their copy publicly and unauthenticated, it's their responsibility
  to add real authentication (an auth proxy, or keep the backend internal) on top
  of the built-in safeguards, or to seed the data via the CLI (`make seed_data`)
  instead of exposing the setup routine.

## Residual risk & possible follow-ups

The safeguards mitigate accidental and drive-by abuse; they are **not**
authentication. The maintained demo relies on SSO for that. A self-hosted copy
exposed publicly without an auth proxy should consider adding:

- **Auth / SSO integration** - gate `/api/demo/*` behind the deployment's identity
  provider.
- **Keep the backend a loopback-only sidecar** - don't give it a Service or
  ingress, so the process-running endpoints stay reachable only from the frontend
  (safeguard #8).
- **Output sanitization** - strip absolute filesystem paths from the streamed logs
  (minor information-disclosure hardening).
