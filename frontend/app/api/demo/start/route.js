import { spawn } from "node:child_process";
import { BACKEND_DIR, FRONTEND_DIR, startFeeder, stopFeeder } from "@/lib/demo/feeder";

// Long-running: generate + load can take a couple of minutes.
export const maxDuration = 600;
export const dynamic = "force-dynamic";

// Run a command to completion, streaming its output line-by-line via onData.
function runStep(cmd, args, cwd, onData) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd, env: process.env });
    proc.stdout.on("data", (d) => onData(d.toString()));
    proc.stderr.on("data", (d) => onData(d.toString()));
    proc.on("error", reject);
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`))
    );
  });
}

// Guard against overlapping regenerations (two of them racing the drop+create of
// the readings collection is exactly what corrupts it). Survives dev hot-reload.
function isRunning() {
  return globalThis.__demoStarting === true;
}

export async function POST(request) {
  let body = {};
  try {
    body = await request.json();
  } catch {
    /* no body */
  }
  const withFeeder = body.feeder !== false; // default: start the live feeder

  if (isRunning()) {
    return Response.json(
      { error: "A demo generation is already in progress. Please wait for it to finish." },
      { status: 409 }
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
        stopFeeder();
        send("step", { step: "generate", message: "Generating the dataset (current dates)…" });
        await runStep("uv", ["run", "scripts/data_pipeline/pipeline.py"], BACKEND_DIR, log);

        send("step", { step: "load", message: "Loading collections into Atlas…" });
        await runStep("uv", ["run", "scripts/data_pipeline/load_to_mongo.py"], BACKEND_DIR, log);

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
          const res = startFeeder();
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
