#!/usr/bin/env python
"""
One-shot setup for the Queryable Encryption Explorer demo.

Creates the encrypted collection used by frontend/app/queryable-encryption:
  1. Enriches customer_db with synthetic PII (name, ssn, billing_amount,
     payment_method, address) — the plaintext "exposure" demo needs these.
  2. Creates a local-master-key DEK in the __keyVault collection.
  3. Creates customer_db_encrypted by copying customer_db through an
     autoEncryption-enabled client — ssn (equality) and billing_amount
     (range) are encrypted client-side; everything else stays plaintext.

Idempotent-ish: re-running refreshes PII values and re-copies the data.
Never run against a cluster holding real customer PII.

    cd backend
    uv run scripts/setup_qe.py
"""
import os
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "data_pipeline"))
from _config import resolve_target  # noqa: E402

from bson import json_util  # noqa: E402
from bson.codec_options import CodecOptions  # noqa: E402
from pymongo import MongoClient  # noqa: E402
from pymongo.encryption import AutoEncryptionOpts, ClientEncryption  # noqa: E402

KEY_VAULT_NAMESPACE = "encryption.__keyVault"
MASTER_KEY_PATH = Path(__file__).resolve().parent.parent / "qe_masterkey.txt"
FIELDS_CONFIG_PATH = Path(__file__).resolve().parent.parent / "qe_encrypted_fields.json"
ENCRYPTED_COLLECTION = "customer_db_encrypted"
SSN_ENCRYPTED_FIELDS = ["ssn"]
RANGE_ENCRYPTED_FIELDS = ["billing_amount"]
# Range query bounds must bracket every stored billing_amount.
BILLING_MIN = 0
BILLING_MAX = 400

FIRST_NAMES = ["Maria", "James", "Wei", "Aisha", "Diego", "Anna", "Omar", "Sofia", "Liam", "Priya"]
LAST_NAMES = ["Garcia", "Chen", "Okafor", "Silva", "Kim", "Novak", "Rossi", "Haddad", "Nguyen", "Smith"]
PAYMENT_METHODS = ["credit_card", "debit_card", "bank_transfer", "paypal", "check"]
STREETS = ["Oak", "Maple", "Cedar", "Elm", "Pine", "Birch", "Willow", "Sunset"]


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
    """QE encryptedFields: ssn is equality-queryable, billing_amount range-queryable.

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
            for field in SSN_ENCRYPTED_FIELDS
        ]
        + [
            {
                "path": field,
                "bsonType": "int",
                "keyId": None,
                "queries": {
                    "queryType": "range",
                    "min": BILLING_MIN,
                    "max": BILLING_MAX,
                },
            }
            for field in RANGE_ENCRYPTED_FIELDS
        ]
    }


def enrich_plaintext(db):
    """Give customer_db docs the synthetic PII fields the demo walks through."""
    rng = random.Random(42)
    updated = 0
    for doc in db["customer_db"].find({}):
        first = rng.choice(FIRST_NAMES)
        last = rng.choice(LAST_NAMES)
        db["customer_db"].update_one(
            {"_id": doc["_id"]},
            {
                "$set": {
                    "name": f"{first} {last}",
                    "ssn": f"{rng.randint(100, 999):03d}-{rng.randint(10, 99):02d}-{rng.randint(1000, 9999):04d}",
                    "billing_amount": rng.randint(40, 350),
                    "payment_method": rng.choice(PAYMENT_METHODS),
                    "address": f"{rng.randint(100, 9999)} {rng.choice(STREETS)} St, {doc.get('city', 'Austin')}, {doc.get('state', 'Texas')}",
                }
            },
        )
        updated += 1
    print(f"Enriched {updated} customer_db docs with synthetic PII.")


def main():
    uri, dbname = resolve_target()
    kms_providers = {"local": {"key": get_or_create_master_key()}}

    plain_client = MongoClient(uri)
    db = plain_client[dbname]
    enrich_plaintext(db)

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
        ),
    )

    # Copy docs through the encrypted client — ssn / billing_amount encrypted.
    edb = encrypted_client[dbname]
    docs = list(db["customer_db"].find({}))
    edb[ENCRYPTED_COLLECTION].insert_many(docs)
    print(f"Copied {len(docs)} docs into {ENCRYPTED_COLLECTION}.")

    # Sanity checks: equality + range queries must work through the client.
    sample = docs[0]
    eq = edb[ENCRYPTED_COLLECTION].find_one({"ssn": sample["ssn"]})
    assert eq and eq["name"] == sample["name"], "equality query on ssn failed"
    hi = list(edb[ENCRYPTED_COLLECTION].find({"billing_amount": {"$gte": 200}}))
    print(f"Equality match on ssn: OK. Range ($gte 200) matched {len(hi)} docs.")

    # What the server actually stores must be ciphertext:
    raw = plain_client[dbname][ENCRYPTED_COLLECTION].find_one()
    assert isinstance(raw["ssn"], bytes) and isinstance(raw["billing_amount"], bytes), (
        "ssn/billing_amount are not stored as ciphertext — encryption not applied"
    )
    print("Server-side check: ssn and billing_amount stored as Binary ciphertext. Done.")

    encrypted_client.close()
    plain_client.close()


if __name__ == "__main__":
    main()
