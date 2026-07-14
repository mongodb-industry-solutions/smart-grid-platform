#!/usr/bin/env bash
#
# Exports the operational collections into ./dump so they can be committed to the
# repo and restored by anyone running the demo (see scripts/restore-data.sh).
#
# The AI knowledge base (kb_articles) is NOT dumped here — it has its own seed
# script that also builds the search indexes:
#   cd frontend && node --env-file=.env.local scripts/seedKnowledgeBase.mjs
#
# Reads MONGODB_URI and DATABASE_NAME from frontend/.env.local at runtime.
# Requires the MongoDB Database Tools (mongodump).
#
# Usage (from the repo root):
#   ./scripts/dump-data.sh
#
set -euo pipefail

ENV_FILE="${ENV_FILE:-frontend/.env.local}"
DUMP_DIR="${DUMP_DIR:-dump}"

# Operational collections to include in the dump.
COLLECTIONS=(readings network meter_network_map customer_db tariff_catalog)

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: $ENV_FILE not found. Set ENV_FILE=path/to/.env to override." >&2
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

rm -rf "$DUMP_DIR"
mkdir -p "$DUMP_DIR"

echo "Dumping ${#COLLECTIONS[@]} collections from database '${DATABASE_NAME}' into ${DUMP_DIR}/ (gzip) ..."
for c in "${COLLECTIONS[@]}"; do
  echo "  • ${c}"
  mongodump --uri "$MONGODB_URI" --db "$DATABASE_NAME" --collection "$c" --gzip --out "$DUMP_DIR"
done

echo "Done. Commit the ${DUMP_DIR}/ directory so others can restore it."
