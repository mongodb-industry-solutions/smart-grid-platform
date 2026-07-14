#!/usr/bin/env bash
#
# Restores the operational collections from ./dump into your own MongoDB Atlas
# cluster. Run this once when setting up the demo, then seed the AI knowledge
# base separately:
#   cd frontend && node --env-file=.env.local scripts/seedKnowledgeBase.mjs
#
# Reads MONGODB_URI and DATABASE_NAME from frontend/.env.local at runtime.
# Requires the MongoDB Database Tools (mongorestore).
#
# Usage (from the repo root):
#   ./scripts/restore-data.sh
#
set -euo pipefail

ENV_FILE="${ENV_FILE:-frontend/.env.local}"
DUMP_DIR="${DUMP_DIR:-dump}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found. Set ENV_FILE=path/to/.env to override." >&2
  exit 1
fi

if [[ ! -d "$DUMP_DIR" ]]; then
  echo "Error: dump directory '$DUMP_DIR' not found." >&2
  exit 1
fi

# Read a single KEY from a dotenv file, tolerating spaces around '=' and quotes.
# Never echoes the value — only assigns it to the caller's variable.
read_env() {
  local key="$1" file="$2" line val
  line="$(grep -E "^[[:space:]]*(export[[:space:]]+)?${key}[[:space:]]*=" "$file" | tail -n1)" || true
  [[ -z "$line" ]] && return 1
  val="${line#*=}"
  val="${val#"${val%%[![:space:]]*}"}"   # trim leading whitespace
  val="${val%"${val##*[![:space:]]}"}"   # trim trailing whitespace
  val="${val%\"}"; val="${val#\"}"        # strip surrounding double quotes
  val="${val%\'}"; val="${val#\'}"        # strip surrounding single quotes
  printf -v "$key" '%s' "$val"
}

read_env MONGODB_URI "$ENV_FILE" || { echo "Error: MONGODB_URI not set in $ENV_FILE" >&2; exit 1; }
read_env DATABASE_NAME "$ENV_FILE" || { echo "Error: DATABASE_NAME not set in $ENV_FILE" >&2; exit 1; }

# The dump was created from a database whose name may differ from yours, so map
# whatever source database is in the dump to your DATABASE_NAME.
SOURCE_DB="$(basename "$(find "$DUMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n1)")"
if [[ -z "$SOURCE_DB" ]]; then
  echo "Error: no database directory found inside '$DUMP_DIR'." >&2
  exit 1
fi

echo "Restoring collections from ${DUMP_DIR}/${SOURCE_DB} into database '${DATABASE_NAME}' ..."
mongorestore --uri "$MONGODB_URI" \
  --gzip \
  --nsFrom "${SOURCE_DB}.*" \
  --nsTo "${DATABASE_NAME}.*" \
  "$DUMP_DIR"

echo "Done. Next: seed the knowledge base (see frontend/scripts/seedKnowledgeBase.mjs)."
