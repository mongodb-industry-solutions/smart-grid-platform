import { spawn } from "node:child_process";
import path from "node:path";

// The data pipeline lives in the sibling backend/ folder; the Next server runs
// from frontend/, so resolve backend relative to the process cwd.
export const BACKEND_DIR = path.resolve(process.cwd(), "..", "backend");
export const FRONTEND_DIR = process.cwd();

// Track the feeder across route-module reloads (dev hot-reload) via globalThis.
function slot() {
  if (!globalThis.__demoFeeder) globalThis.__demoFeeder = { proc: null };
  return globalThis.__demoFeeder;
}

export function isFeederRunning() {
  const p = slot().proc;
  return !!(p && p.exitCode === null && !p.killed);
}

// Start the live feeder detached so it keeps streaming after the request ends.
// No-op if one is already running.
export function startFeeder(args = []) {
  if (isFeederRunning()) return { started: false, alreadyRunning: true };
  const proc = spawn("uv", ["run", "scripts/data_pipeline/feeder.py", ...args], {
    cwd: BACKEND_DIR,
    env: process.env,
    detached: true,
    stdio: "ignore",
  });
  proc.unref();
  slot().proc = proc;
  return { started: true, pid: proc.pid };
}

export function stopFeeder() {
  const p = slot().proc;
  if (!isFeederRunning()) return { stopped: false };
  try {
    // Negative pid kills the detached process group.
    process.kill(-p.pid, "SIGINT");
  } catch {
    try {
      p.kill("SIGINT");
    } catch {
      /* already gone */
    }
  }
  slot().proc = null;
  return { stopped: true };
}
