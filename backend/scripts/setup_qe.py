#!/usr/bin/env python
"""
One-shot setup for the Queryable Encryption Explorer demo.

Creates the encrypted collection used by frontend/app/queryable-encryption:
  1. Builds metering_points from customer_db, adding the synthetic CIM fields
     the plaintext "exposure" demo walks through (metering_point_id,
     consumption_kwh, service_address, segment). customer_db is left untouched.
  2. Creates a local-master-key DEK in the __keyVault collection.
  3. Creates metering_points_encrypted by copying metering_points through an
     autoEncryption-enabled client — metering_point_id (equality) and
     consumption_kwh (range) are encrypted client-side; everything else stays
     plaintext.

Idempotent-ish: re-running refreshes the synthetic values and re-copies the data.
Never run against a cluster holding real customer PII.

The target cluster must be named explicitly — this script writes synthetic PII,
so it does NOT silently inherit frontend/.env.local the way the data pipeline
does. Pass --uri/--db, or --from-env to opt into the local env file:

    cd backend
    uv run scripts/setup_qe.py --uri "mongodb+srv://..." --db smart_grid_platform
    uv run scripts/setup_qe.py --from-env
"""
import argparse
import os
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "data_pipeline"))

from bson import json_util  # noqa: E402
from bson.codec_options import CodecOptions  # noqa: E402
from pymongo import MongoClient  # noqa: E402
from pymongo.encryption import AutoEncryptionOpts, ClientEncryption  # noqa: E402

KEY_VAULT_NAMESPACE = "encryption.__keyVault"
MASTER_KEY_PATH = Path(__file__).resolve().parent.parent / "qe_masterkey.txt"
FIELDS_CONFIG_PATH = Path(__file__).resolve().parent.parent / "qe_encrypted_fields.json"
PLAINTEXT_COLLECTION = "metering_points"
ENCRYPTED_COLLECTION = "metering_points_encrypted"
# Automatic encryption needs the crypt_shared library (query analysis). Point at
# a local copy via CRYPT_SHARED_PATH, or drop it in backend/.crypt_shared/.
DEFAULT_CRYPT_SHARED = (
    Path(__file__).resolve().parent.parent / ".crypt_shared" / "mongo_crypt_v1.dylib"
)
ID_ENCRYPTED_FIELDS = ["metering_point_id"]
RANGE_ENCRYPTED_FIELDS = ["consumption_kwh"]
# Range query bounds must bracket every stored consumption_kwh.
CONSUMPTION_MIN = 0
CONSUMPTION_MAX = 400
# The walkthrough's equality step looks this exact metering point up, so seeding
# must guarantee it exists (ids are assigned in sequence, MP-000001, ...).
DEMO_METERING_POINT_ID = "MP-000001"

FIRST_NAMES = ["Maria", "James", "Wei", "Aisha", "Diego", "Anna", "Omar", "Sofia", "Liam", "Priya"]
LAST_NAMES = ["Garcia", "Chen", "Okafor", "Silva", "Kim", "Novak", "Rossi", "Haddad", "Nguyen", "Smith"]
SEGMENTS = ["residential", "commercial", "industrial"]
STREETS = ["Oak", "Maple", "Cedar", "Elm", "Pine", "Birch", "Willow", "Sunset"]


def crypt_shared_path():
    """Resolve the crypt_shared library, which automatic encryption requires."""
    path = Path(os.environ.get("CRYPT_SHARED_PATH", DEFAULT_CRYPT_SHARED))
    if not path.is_file():
        raise SystemExit(
            f"crypt_shared library not found at {path}.\n"
            "Download it for your platform from the MongoDB Enterprise downloads "
            "(mongo_crypt_shared_v1-<platform>.tgz, lib/mongo_crypt_v1.*) and "
            "place it there, or set CRYPT_SHARED_PATH."
        )
    return str(path)


def get_or_create_master_key():
    """Local KMS master key — a 96-byte random secret kept on disk."""
    if MASTER_KEY_PATH.exists():
        key = bytes.fromhex(MASTER_KEY_PATH.read_text().strip())
    else:
        key = os.urandom(96)
        MASTER_KEY_PATH.write_text(key.hex() + "\n")
        os.chmod(MASTER_KEY_PATH, 0o600)
    return key


def encrypted_fields_config():
    """QE encryptedFields: metering_point_id is equality-queryable,
    consumption_kwh is range-queryable.

    keyId is left None so create_encrypted_collection provisions a fresh DEK per
    field and returns the filled-in config for the client's encryptedFieldsMap.
    """
    return {
        "fields": [
            {
                "path": field,
                "bsonType": "string",
                "keyId": None,
                "queries": {"queryType": "equality"},
            }
            for field in ID_ENCRYPTED_FIELDS
        ]
        + [
            {
                "path": field,
                "bsonType": "int",
                "keyId": None,
                "queries": {
                    "queryType": "range",
                    "min": CONSUMPTION_MIN,
                    "max": CONSUMPTION_MAX,
                },
            }
            for field in RANGE_ENCRYPTED_FIELDS
        ]
    }


def seed_plaintext(db):
    """Build metering_points: one CIM-style metering point per customer.

    Carries the synthetic fields the walkthrough encrypts. ids are assigned in
    sequence (MP-000001, ...) so the equality step can look up a known metering
    point. customer_db itself is left untouched.
    """
    rng = random.Random(42)
    db[PLAINTEXT_COLLECTION].drop()
    docs = []
    for i, customer in enumerate(db["customer_db"].find({}), start=1):
        first = rng.choice(FIRST_NAMES)
        last = rng.choice(LAST_NAMES)
        docs.append(
            {
                "metering_point_id": f"MP-{i:06d}",
                "consumption_kwh": rng.randint(40, 350),
                "service_address": f"{rng.randint(100, 9999)} {rng.choice(STREETS)} St",
                "segment": rng.choice(SEGMENTS),
                "customer_name": f"{first} {last}",
                "dataid": customer.get("dataid"),
                "city": customer.get("city"),
                "state": customer.get("state"),
            }
        )
    if docs:
        db[PLAINTEXT_COLLECTION].insert_many(docs)
    print(f"Seeded {len(docs)} {PLAINTEXT_COLLECTION} docs (plaintext).")


def resolve_explicit_target():
    """Require an explicit target. Writing synthetic PII to the wrong cluster is
    not recoverable by a re-run, so there is no implicit default."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--uri", help="MongoDB connection string")
    parser.add_argument("--db", help="Database name")
    parser.add_argument(
        "--from-env",
        action="store_true",
        help="Use MONGODB_URI/DATABASE_NAME from frontend/.env.local",
    )
    parser.add_argument(
        "--plaintext-only",
        action="store_true",
        help="Only build metering_points (steps 1-2 of the walkthrough); skip "
        "the encrypted collection, which needs crypt_shared.",
    )
    args = parser.parse_args()

    if args.from_env:
        from _config import resolve_target

        uri, dbname = resolve_target()
        return uri, dbname, args.plaintext_only

    if not args.uri or not args.db:
        parser.error("specify both --uri and --db, or pass --from-env")
    return args.uri, args.db, args.plaintext_only


def main():
    uri, dbname, plaintext_only = resolve_explicit_target()
    host = uri.split("@")[-1].split("/")[0]
    print(f"Target: {host} / {dbname}")

    if plaintext_only:
        plain_client = MongoClient(uri)
        seed_plaintext(plain_client[dbname])
        plain_client.close()
        print("Plaintext seed complete (steps 1-2). Encrypted collection skipped.")
        return

    kms_providers = {"local": {"key": get_or_create_master_key()}}

    plain_client = MongoClient(uri)
    db = plain_client[dbname]
    seed_plaintext(db)

    # Key vault: unique index on keyAltNames is required by the QE spec.
    key_vault_db = plain_client["encryption"]
    key_vault_db["__keyVault"].create_index(
        "keyAltNames",
        name="keyAltNames_1",
        unique=True,
        partialFilterExpression={"keyAltNames": {"$exists": True}},
    )

    client_encryption = ClientEncryption(
        kms_providers, KEY_VAULT_NAMESPACE, plain_client, CodecOptions()
    )

    # Recreate from scratch: QE keeps metadata collections (enxcol_.*) alongside
    # the data collection, so they must be dropped together.
    for name in (
        ENCRYPTED_COLLECTION,
        f"enxcol_.{ENCRYPTED_COLLECTION}.esc",
        f"enxcol_.{ENCRYPTED_COLLECTION}.ecoc",
    ):
        db.drop_collection(name)

    # create_encrypted_collection provisions one DEK per encrypted field and
    # returns the config with keyIds filled in — that is what the client needs.
    _, filled_fields = client_encryption.create_encrypted_collection(
        db, ENCRYPTED_COLLECTION, encrypted_fields_config(), "local"
    )
    print(f"Created {ENCRYPTED_COLLECTION} with {len(filled_fields['fields'])} encrypted fields.")

    # Persist the config so the Node app can build the same encryptedFieldsMap.
    FIELDS_CONFIG_PATH.write_text(json_util.dumps(filled_fields, indent=2) + "\n")
    print(f"Wrote encryptedFields config to {FIELDS_CONFIG_PATH}")

    namespace = f"{dbname}.{ENCRYPTED_COLLECTION}"
    encrypted_client = MongoClient(
        uri,
        auto_encryption_opts=AutoEncryptionOpts(
            kms_providers,
            KEY_VAULT_NAMESPACE,
            encrypted_fields_map={namespace: filled_fields},
            crypt_shared_lib_path=crypt_shared_path(),
            crypt_shared_lib_required=True,
        ),
    )

    # Copy docs through the encrypted client — metering_point_id / consumption_kwh
    # encrypted.
    edb = encrypted_client[dbname]
    docs = list(db[PLAINTEXT_COLLECTION].find({}))
    edb[ENCRYPTED_COLLECTION].insert_many(docs)
    print(f"Copied {len(docs)} docs into {ENCRYPTED_COLLECTION}.")

    # Sanity checks: equality + range queries must work through the client.
    eq = edb[ENCRYPTED_COLLECTION].find_one(
        {"metering_point_id": DEMO_METERING_POINT_ID}
    )
    assert eq and eq["metering_point_id"] == DEMO_METERING_POINT_ID, (
        f"equality query on metering_point_id ({DEMO_METERING_POINT_ID}) failed"
    )
    hi = list(edb[ENCRYPTED_COLLECTION].find({"consumption_kwh": {"$gte": 200}}))
    print(f"Equality match on {DEMO_METERING_POINT_ID}: OK. Range ($gte 200) matched {len(hi)} docs.")

    # What the server actually stores must be ciphertext:
    raw = plain_client[dbname][ENCRYPTED_COLLECTION].find_one()
    assert isinstance(raw["metering_point_id"], bytes) and isinstance(
        raw["consumption_kwh"], bytes
    ), "metering_point_id/consumption_kwh are not stored as ciphertext — encryption not applied"
    print("Server-side check: metering_point_id and consumption_kwh stored as Binary ciphertext. Done.")

    encrypted_client.close()
    plain_client.close()


if __name__ == "__main__":
    main()
