// Client for the backend's demo endpoints. The Python data pipeline (generate /
// load / feeder) runs in the backend container — which has Python + uv — so the
// frontend (Node only) forwards to it over the internal service URL instead of
// spawning `uv` locally.

// The Next server runs from frontend/; the KB seed step still spawns a local
// Node script, so keep this for that step's cwd.
export const FRONTEND_DIR = process.cwd();

const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");

export function backendUrl(path) {
  return `${BACKEND_URL}${path}`;
}

export async function startFeeder() {
  const r = await fetch(backendUrl("/demo/feeder/start"), { method: "POST" });
  if (!r.ok) throw new Error(`feeder start failed: ${r.status}`);
  return r.json();
}

export async function stopFeeder() {
  try {
    const r = await fetch(backendUrl("/demo/feeder/stop"), { method: "POST" });
    return r.json();
  } catch {
    return { stopped: false };
  }
}

export async function isFeederRunning() {
  try {
    const r = await fetch(backendUrl("/demo/feeder/status"));
    if (!r.ok) return false;
    const d = await r.json();
    return !!d.feederRunning;
  } catch {
    return false;
  }
}
