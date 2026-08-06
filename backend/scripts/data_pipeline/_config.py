"""Single source of truth for the pipeline's DB connection.

The pipeline seeds exactly the cluster/database the app reads, so it uses the
app's own env file (frontend/.env.local) and the same variable names — no
separate backend config to keep in sync.
"""
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

_REPO = Path(__file__).resolve().parents[3]
ENV_FILE = _REPO / "frontend" / ".env.local"


def resolve_target():
    """Return (uri, database_name) from frontend/.env.local. Uses override=True so
    this file is authoritative even if another import (e.g. db.mdb's load_dotenv,
    which reads a stray backend/.env) already populated MONGODB_URI/DATABASE_NAME
    with different values."""
    load_dotenv(ENV_FILE, override=True)
    uri = os.getenv("MONGODB_URI")
    db = os.getenv("DATABASE_NAME")
    if not uri or not db:
        sys.exit(f"Set MONGODB_URI and DATABASE_NAME in {ENV_FILE}")
    return uri, db
