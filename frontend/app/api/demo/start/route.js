import { spawn } from "node:child_process";
import getMongoClientPromise from "@/lib/mongodb";
import { FRONTEND_DIR, backendUrl, startFeeder, stopFeeder } from "@/lib/demo/feeder";
import { sameOriginOk } from "@/lib/http/sameOrigin";

// Long-running: generate + load can take a couple of minutes.
export const maxDuration = 600;
export const dynamic = "force-dynamic";

// Kill a spawned step if it hangs, so a stuck process can't run forever.
const STEP_TIMEOUT_MS = Number(process.env.DEMO_STEP_TIMEOUT_MS) || 10 * 60 * 1000;
// Minimum time between regenerations. The data is anchored to "now", so there's
// no reason to rebuild more often; this also blocks accidental/abusive repeats.
// Set DEMO_REGEN_COOLDOWN_MINUTES=0 to disable (e.g. while developing).
const REGEN_COOLDOWN_MS =
  (process.env.DEMO_REGEN_COOLDOWN_MINUTES != null
    ? Number(process.env.DEMO_REGEN_COOLDOWN_MINUTES)
    : 60) *
  60 *
  1000;

// Run a command to completion, streaming its output line-by-line via onData.
// Rejects (and kills the process) if it exceeds STEP_TIMEOUT_MS.
function runStep(cmd, args, cwd, onData) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, env: process.env });
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`${cmd} ${args.join(" ")} timed out after ${Math.round(STEP_TIMEOUT_MS / 1000)}s`));
    }, STEP_TIMEOUT_MS);
    proc.stdout.on("data", (d) => onData(d.toString()));
    proc.stderr.on("data", (d) => onData(d.toString()));
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve()
        : reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

// Run a Python pipeline step on the backend, streaming its output line-by-line
// via onData. The backend streams raw log lines and ends with a `__DONE__:<code>`
// sentinel; a non-zero code (or a missing sentinel) rejects.
async function runBackendStep(path, onData) {
  const res = await fetch(backendUrl(path), { method: "POST" });
  if (res.status === 409) throw new Error("A pipeline step is already running on the backend.");
  if (!res.body) throw new Error(`backend ${path} failed: HTTP ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let exitCode = null;

  const handleLine = (line) => {
    if (line === "__PING__") return; // backend keepalive during silent steps
    const m = line.match(/^__DONE__:(\d+)$/);
    if (m) exitCode = Number(m[1]);
    else if (line) onData(line + "\n");
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep the trailing partial line
    lines.forEach(handleLine);
  }
  if (buffer) handleLine(buffer);

  if (exitCode === null) throw new Error(`backend ${path} ended without a status.`);
  if (exitCode !== 0) throw new Error(`backend ${path} exited with code ${exitCode}.`);
}

// Guard against overlapping regenerations (two of them racing the drop+create of
// the readings collection is exactly what corrupts it). Survives dev hot-reload.
function isRunning() {
  return globalThis.__demoStarting === true;
}

// Remaining cooldown in ms (0 = allowed), based on the last recorded generation.
async function cooldownRemainingMs() {
  if (!REGEN_COOLDOWN_MS) return 0;
  try {
    const client = await getMongoClientPromise();
    const db = client.db(process.env.DATABASE_NAME);
    const meta = await db.collection("demo_meta").findOne({ _id: "seed" });
    if (!meta?.generatedAt) return 0;
    const elapsed = Date.now() - new Date(meta.generatedAt).getTime();
    return Math.max(0, REGEN_COOLDOWN_MS - elapsed);
  } catch {
    return 0; // if we can't check, don't block the demo
  }
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* no body */
  }
  const withFeeder = body.feeder !== false; // default: start the live feeder

  // Reject cross-site browser requests (CSRF-style drive-by triggers).
  if (!sameOriginOk(request)) {
    return Response.json({ error: "Cross-origin request rejected." }, { status: 403 });
  }

  if (isRunning()) {
    return Response.json(
      { error: "A demo generation is already in progress. Please wait for it to finish." },
      { status: 409 }
    );
  }

  // Rate-limit: only allow a regeneration once the cooldown has elapsed.
  const remaining = await cooldownRemainingMs();
  if (remaining > 0) {
    const mins = Math.ceil(remaining / 60000);
    return Response.json(
      { error: `Data was generated recently. Try again in ~${mins} min.` },
      { status: 429 }
    );
  }

  globalThis.__demoStarting = true;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event, data = {}) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ event, ...data })}\n\n`));
      const log = (line) => send("log", { line });

      try {
        // Stop any running feeder FIRST. Otherwise its inserts race the loader's
        // drop+create of the readings time-series collection and can re-create it
        // as a plain collection (losing metaField/bucketing → slow queries).
        await stopFeeder();
        send("step", { step: "generate", message: "Generating the dataset (current dates)…" });
        await runBackendStep("/demo/generate", log);

        send("step", { step: "load", message: "Loading collections into Atlas…" });
        await runBackendStep("/demo/load", log);

        // Best-effort: the operational demo still works without it, but the AI
        // agent / vector map need the knowledge base.
        send("step", { step: "kb", message: "Seeding the AI knowledge base…" });
        try {
          await runStep(
            "node",
            ["--env-file=.env.local", "scripts/seedKnowledgeBase.mjs"],
            FRONTEND_DIR,
            log
          );
        } catch (e) {
          log(`(knowledge base skipped: ${e.message})\n`);
        }

        if (withFeeder) {
          send("step", { step: "feeder", message: "Starting the live feeder…" });
          const res = await startFeeder();
          log(res.alreadyRunning ? "feeder already running\n" : `feeder started (pid ${res.pid})\n`);
        }

        send("done", { message: "Demo is ready." });
      } catch (err) {
        send("error", { message: err.message });
      } finally {
        globalThis.__demoStarting = false;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
