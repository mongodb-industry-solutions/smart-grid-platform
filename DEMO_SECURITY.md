# Demo setup endpoint — security notes

Technical reference for the `/api/demo/*` routes that power the **Start Demo**
modal. These endpoints are unusual for a web app: they spawn local processes and
drop/reload MongoDB collections. This document is the threat model and the
safeguards in place, for reviewers and for the next team.

## What the endpoints do

| Route | Method | Effect |
| --- | --- | --- |
| `/api/demo/status` | GET | Read-only: reports whether data is seeded, the readings count, last-generated date, and whether the feeder is running. |
| `/api/demo/start` | POST | **Privileged.** Spawns `uv run pipeline.py`, `uv run load_to_mongo.py`, `node seedKnowledgeBase.mjs`, and (optionally) the feeder. **Drops and reloads** the operational collections. |
| `/api/demo/stop` | POST | Stops the live feeder process. |

`/api/demo/start` is the sensitive one — it both **destroys/regenerates data** and
**runs OS processes**.

## Threat model

### What an attacker CANNOT do (by design)

- **No command injection / RCE.** The spawned commands and their arguments are
  **hardcoded**. The only value read from the request body is a boolean
  (`feeder`); it never flows into a command, path, or shell. `spawn` is used
  without `shell: true`, so there is no shell interpolation. This removes the
  most dangerous class of attack for a "run a process" endpoint.
- **No credential exposure.** The streamed output is pipeline stdout/stderr
  (progress + absolute paths). It contains no secrets; connection strings and API
  keys are never logged.

### What an attacker COULD do without safeguards

- **Data destruction / disruption.** Trigger a regeneration that drops and
  reloads collections — disruptive during a live demo (though the data is fully
  regenerable, so there is no permanent loss).
- **Denial of service.** Repeatedly trigger the ~2–3 minute generation to burn
  CPU/IO, or spawn a long-running process.
- **Cross-site drive-by.** A malicious page could POST to the endpoint from a
  visitor's browser (CSRF-style), since there's no per-user auth.

Overall severity: **moderate** for a demo (no breach, no RCE, regenerable data),
but worth hardening because the endpoint runs processes and mutates the database.

## Safeguards in place

All of these live in `frontend/app/api/demo/start/route.js` (plus process
handling in `frontend/lib/demo/feeder.js`).

1. **No untrusted input reaches the shell.** Fixed command + args; `spawn` without
   `shell: true`. This is the primary control.

2. **Same-origin guard (anti-CSRF).** A request whose `Origin` header is present
   but does **not** match the app's host is rejected with `403`. Requests with no
   `Origin` (curl / server-to-server automation) are allowed. This blocks
   cross-site browser triggers while keeping tooling usable.

3. **Concurrency lock.** A module-level flag (surviving dev hot-reload via
   `globalThis`) rejects overlapping runs with `409`. This also prevents the
   drop+create race that could otherwise corrupt the `readings` time-series
   collection (a running feeder writing mid-reload can recreate it as a plain
   collection). The feeder is also explicitly stopped before the reload.

4. **Cooldown / rate-limit.** Regeneration is refused with `429` if the last run
   (tracked in `demo_meta.generatedAt`) was more recent than
   `DEMO_REGEN_COOLDOWN_MINUTES` (default **60**). Since the data is anchored to
   "now" at generation time, there's no reason to rebuild more often — this blocks
   both accidental double-clicks and abusive repeats.

5. **Per-step process timeout.** Each spawned step is killed (`SIGKILL`) if it
   exceeds `DEMO_STEP_TIMEOUT_MS` (default **600000** = 10 min), so a hung or stuck
   process can't run forever.

6. **Feeder lifecycle limits.** The feeder itself (`feeder.py`) has built-in
   guards independent of the API: `--retain-days` (a rolling retention window so
   the collection can't grow unbounded) and `--max-hours` (auto-stop so an
   orphaned feeder can't run forever). `stopFeeder` terminates the detached
   process group (POSIX) with a Windows-safe fallback.

7. **Kill switch.** `DISABLE_DEMO_SETUP=true` disables `/api/demo/start` entirely
   (`403`) for deployments that must lock it down.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DISABLE_DEMO_SETUP` | unset | `true` fully disables `/api/demo/start`. |
| `DEMO_REGEN_COOLDOWN_MINUTES` | `60` | Minimum minutes between regenerations; `0` disables the cooldown (useful while developing). |
| `DEMO_STEP_TIMEOUT_MS` | `600000` | Max runtime per spawned step before it's killed. |

## Deployment guidance

- **Internal demo behind SSO (e.g. Kanopy):** the platform's authentication
  already gates the whole app, so the endpoint inherits that protection. The
  safeguards above are defense-in-depth. This is the recommended posture.
- **Public / unauthenticated exposure:** the endpoint remains destructive-by-DoS.
  Add real authentication (a shared-secret token header, or an auth proxy) in
  addition to the safeguards, or set `DISABLE_DEMO_SETUP=true` and seed the data
  out-of-band via the CLI (`make seed_data`).

## Residual risk & possible follow-ups

The safeguards mitigate accidental and drive-by abuse; they are **not**
authentication. If the app is ever exposed publicly without an auth proxy,
consider adding:

- **Shared-secret token** — require an `x-demo-token` header validated against an
  env secret (the modal includes it).
- **Auth / SSO integration** — gate `/api/demo/*` behind the deployment's identity
  provider.
- **Output sanitization** — strip absolute filesystem paths from the streamed logs
  (minor information-disclosure hardening).
