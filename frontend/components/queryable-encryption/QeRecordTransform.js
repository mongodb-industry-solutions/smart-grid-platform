"use client";

import styles from "@/style/queryable-encryption/qe-record.module.css";

// The same metering point, shown twice: as it sits in the plaintext collection
// and as the driver stores it in the encrypted collection. Same record, same
// _id — the only difference is which fields crossed the encryption boundary.
const CIPHER_ID = 'BinData(6, "xhrTxieVRCW3xVx…")';
const CIPHER_KWH = 'BinData(6, "wt46hsH6Qje0f/kj…")';
const SAFE_DIGEST = 'BinData(0, "Qeg1XIPnDIORNqYP…")';

const PLAIN_FIELDS = [
  { key: "metering_point_id", value: '"MP-000001"', encrypted: true },
  { key: "consumption_kwh", value: "180", encrypted: true },
  { key: "segment", value: '"Residential"', encrypted: false },
  { key: "service_address", value: '"12 Rue de la Loi, Bruxelles"', encrypted: false },
  { key: "region", value: '"BE-BRU"', encrypted: false },
];

const STORED_FIELDS = [
  { key: "metering_point_id", value: CIPHER_ID, encrypted: true },
  { key: "consumption_kwh", value: CIPHER_KWH, encrypted: true },
  { key: "segment", value: '"Residential"', encrypted: false },
  { key: "service_address", value: '"12 Rue de la Loi, Bruxelles"', encrypted: false },
  { key: "region", value: '"BE-BRU"', encrypted: false },
  { key: "__safeContent__", value: SAFE_DIGEST, safe: true },
];

function Field({ field }) {
  return (
    <div className={styles.field}>
      <span
        className={`${styles.fieldKey} ${field.encrypted ? styles.keyEnc : ""} ${
          field.safe ? styles.keySafe : ""
        }`}
      >
        {field.encrypted && <span className={styles.lock}>🔒</span>}
        {field.key}
      </span>
      <code
        className={`${styles.fieldVal} ${field.encrypted ? styles.valEnc : ""} ${
          field.safe ? styles.valSafe : ""
        }`}
      >
        {field.value}
      </code>
    </div>
  );
}

export default function QeRecordTransform() {
  return (
    <div className={styles.wrap}>
      <div className={styles.grid}>
        <div className={`${styles.card} ${styles.cardPlain}`}>
          <div className={styles.cardHead}>
            <span className={styles.cardTag}>Before</span>
            <span className={styles.cardTitle}>db.metering_points</span>
          </div>
          {PLAIN_FIELDS.map((f) => (
            <Field key={f.key} field={f} />
          ))}
        </div>

        <div className={styles.arrow} aria-hidden="true">
          <span className={styles.arrowIcon}>→</span>
          <span className={styles.arrowCap}>encrypt sensitive fields</span>
        </div>

        <div className={`${styles.card} ${styles.cardEnc}`}>
          <div className={styles.cardHead}>
            <span className={`${styles.cardTag} ${styles.tagEnc}`}>After</span>
            <span className={styles.cardTitle}>db.metering_points_encrypted</span>
          </div>
          {STORED_FIELDS.map((f) => (
            <Field key={f.key} field={f} />
          ))}
        </div>
      </div>

      <div className={styles.notes}>
        <div className={styles.note}>
          <span className={styles.noteHead}>What is __safeContent__?</span>
          It is <em>not</em> the consumption. The driver adds it automatically —
          an array of HMAC-SHA-256 integrity digests, one per encrypted field.
          The server uses it to detect if a stored document was tampered with,
          <em> without decrypting anything</em>. It reveals nothing about the
          plaintext; it is a tamper check, not data.
        </div>
        <div className={styles.note}>
          <span className={styles.noteHead}>Why is consumption sensitive?</span>
          Per-meter consumption at interval resolution is a behavioural
          fingerprint: it reveals whether a home is occupied, daily routines and
          appliances, even health signals. That makes it personal data under GDPR
          and sensitive under critical-infrastructure rules such as NIS2. A TSO
          needs <em>fleet-level</em> range analytics — not each customer&apos;s
          plaintext. Queryable Encryption gives the queries without anyone having
          to hold the values.
        </div>
      </div>
    </div>
  );
}
