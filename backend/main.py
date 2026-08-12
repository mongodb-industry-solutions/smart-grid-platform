import asyncio
import os
import signal
import subprocess
import time

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# The pipeline scripts live alongside this file (backend/ locally, / in the image).
# These demo endpoints are not publicly ingressed (ingress.enabled=false); only the
# frontend, inside the cluster, can reach them — so no extra auth is needed here.
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))

# Kill a pipeline step if it hangs (mirrors the old frontend STEP_TIMEOUT).
STEP_TIMEOUT_S = (int(os.getenv("DEMO_STEP_TIMEOUT_MS", str(10 * 60 * 1000)))) / 1000
# Emit a keepalive at least this often so a silent step doesn't let the client's
# streaming fetch time out and abort with "terminated".
HEARTBEAT_S = 10

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Live feeder subprocess + a lock so two pipeline runs can't race the loader's
# drop+create of the readings time-series collection.
_feeder = {"proc": None}
_pipeline_busy = {"value": False}


@app.get("/")
async def read_root(request: Request):
    return {"message": "Server is running"}


# --- Data pipeline (streamed) -------------------------------------------------

async def _stream_cmd(args):
    """Run a command, yielding its combined stdout/stderr line-by-line, then a
    final `__DONE__:<exit_code>` sentinel the caller parses. Kills the process if
    it exceeds STEP_TIMEOUT_S."""
    proc = await asyncio.create_subprocess_exec(
        *args,
        cwd=BACKEND_DIR,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )
    deadline = time.monotonic() + STEP_TIMEOUT_S
    try:
        while True:
            if time.monotonic() >= deadline:
                proc.kill()
                yield "[[step timed out]]\n"
                yield "__DONE__:124\n"
                return
            try:
                # Short read timeout so we can emit a heartbeat during silent steps.
                line = await asyncio.wait_for(proc.stdout.readline(), timeout=HEARTBEAT_S)
            except asyncio.TimeoutError:
                # No output for a while (e.g. the silent load step). Emit a keepalive
                # so the client's streaming fetch doesn't abort ("terminated") — the
                # frontend ignores __PING__ lines.
                yield "__PING__\n"
                continue
            if not line:
                break
            yield line.decode(errors="replace")
        code = await proc.wait()
        yield f"__DONE__:{code}\n"
    finally:
        if proc.returncode is None:
            proc.kill()


def _pipeline_stream(args):
    """Wrap _stream_cmd with the busy-lock so concurrent runs can't corrupt the
    readings collection."""
    if _pipeline_busy["value"]:
        raise HTTPException(status_code=409, detail="A pipeline step is already running.")

    async def gen():
        _pipeline_busy["value"] = True
        try:
            async for chunk in _stream_cmd(args):
                yield chunk
        finally:
            _pipeline_busy["value"] = False

    return StreamingResponse(gen(), media_type="text/plain; charset=utf-8")


@app.post("/demo/generate")
async def demo_generate():
    return _pipeline_stream(["uv", "run", "scripts/data_pipeline/pipeline.py"])


@app.post("/demo/load")
async def demo_load():
    return _pipeline_stream(["uv", "run", "scripts/data_pipeline/load_to_mongo.py"])


# --- Live feeder --------------------------------------------------------------

def _feeder_running():
    p = _feeder["proc"]
    return p is not None and p.poll() is None


@app.post("/demo/feeder/start")
def feeder_start():
    if _feeder_running():
        return {"started": False, "alreadyRunning": True}
    proc = subprocess.Popen(
        ["uv", "run", "scripts/data_pipeline/feeder.py"],
        cwd=BACKEND_DIR,
        start_new_session=True,  # own process group so we can signal the whole tree
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    _feeder["proc"] = proc
    return {"started": True, "pid": proc.pid}


@app.post("/demo/feeder/stop")
def feeder_stop():
    p = _feeder["proc"]
    if not _feeder_running():
        return {"stopped": False}
    try:
        os.killpg(os.getpgid(p.pid), signal.SIGINT)
    except Exception:
        try:
            p.send_signal(signal.SIGINT)
        except Exception:
            pass
    _feeder["proc"] = None
    return {"stopped": True}


@app.get("/demo/feeder/status")
def feeder_status():
    return {"feederRunning": _feeder_running()}
