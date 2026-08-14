"""Single source of truth for the pipeline's DB connection.

Locally the pipeline seeds exactly the cluster/database the app reads, so it uses
the app's own env file (frontend/.env.local) and the same variable names — no
separate backend config to keep in sync.

In the container there is no repo checkout: Dockerfile.backend copies only
backend/ to WORKDIR /, so this file lands at /scripts/data_pipeline/_config.py
and frontend/.env.local does not exist. There MONGODB_URI/DATABASE_NAME come
from the environment (injected from the smart-meter secret, see
environment/staging.yaml), so the env file is optional.
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

_ENV_RELPATH = Path("frontend") / ".env.local"


def _find_env_file():
    """Walk up from this file looking for frontend/.env.local. Returns None when
    there is no repo checkout above us (i.e. in the container image)."""
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / _ENV_RELPATH
        if candidate.is_file():
            return candidate
    return None


ENV_FILE = _find_env_file()


def resolve_target():
    """Return (uri, database_name).

    Prefers frontend/.env.local when a checkout is present, using override=True so
    that file is authoritative even if another import (e.g. db.mdb's load_dotenv,
    which reads a stray backend/.env) already populated MONGODB_URI/DATABASE_NAME
    with different values. With no env file, falls back to the process environment.
    """
    if ENV_FILE is not None:
        load_dotenv(ENV_FILE, override=True)
    uri = os.getenv("MONGODB_URI")
    db = os.getenv("DATABASE_NAME")
    if not uri or not db:
        source = ENV_FILE if ENV_FILE is not None else "the environment"
        sys.exit(f"Set MONGODB_URI and DATABASE_NAME in {source}")
    return uri, db
