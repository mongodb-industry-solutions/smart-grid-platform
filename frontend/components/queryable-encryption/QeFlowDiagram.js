"use client";

import styles from "@/style/queryable-encryption/qe-flow.module.css";

// Static explainer: the round-trip a queryable-encryption query takes. The
// point of the diagram is the trust boundary — plaintext exists only on the
// left, the server in the middle only ever handles ciphertext, and the keys
// live on the right where the server cannot reach them.
const CIPHER_TOKEN = "0x9f3ac1…7b2e";

export default function QeFlowDiagram() {
  return (
    <div className={styles.wrap}>
      <div className={styles.grid}>
        {/* ── Trusted side: the application ── */}
        <div className={`${styles.col} ${styles.colTrusted}`}>
          <div className={styles.colHead}>
            <span className={styles.colTag}>Trusted</span>
            <span className={styles.colTitle}>Your application</span>
          </div>

          <div className={`${styles.chip} ${styles.chipPlain}`}>
            <span className={styles.chipLabel}>plaintext query</span>
            <code>{'{ metering_point_id: "MP-000001" }'}</code>
          </div>

          <div className={styles.op}>🔒 encrypt client-side &middot; libmongocrypt</div>

          <div className={`${styles.chip} ${styles.chipCipher}`}>
            <span className={styles.chipLabel}>ciphertext token</span>
            <code>{CIPHER_TOKEN}</code>
          </div>
        </div>

        {/* ── Wire: two-way ciphertext traffic ── */}
        <div className={styles.flow}>
          <div className={styles.flowRow}>
            <span className={styles.flowArrow}>→</span>
            <span className={styles.flowCap}>encrypted query</span>
          </div>
          <div className={styles.flowRow}>
            <span className={`${styles.flowArrow} ${styles.flowBack}`}>←</span>
            <span className={styles.flowCap}>encrypted result</span>
          </div>
          <div className={styles.flowNote}>only ciphertext crosses</div>
        </div>

        {/* ── Untrusted side: the server ── */}
        <div className={`${styles.col} ${styles.colServer}`}>
          <div className={styles.colHead}>
            <span className={`${styles.colTag} ${styles.tagServer}`}>Zero-knowledge</span>
            <span className={styles.colTitle}>MongoDB server</span>
          </div>

          <div className={`${styles.chip} ${styles.chipStored}`}>
            <span className={styles.chipLabel}>encrypted document</span>
            <code>
              {`{ metering_point_id: `}
              <em>{CIPHER_TOKEN}</em>
              {`, consumption_kwh: `}
              <em>0x41d0…a9</em>
              {` }`}
            </code>
          </div>

          <div className={`${styles.chip} ${styles.chipStored}`}>
            <span className={styles.chipLabel}>encrypted indexes</span>
            <code>equality &middot; range</code>
          </div>

          <div className={styles.serverNote}>
            Matches the token against encrypted index entries — never decrypts.
          </div>
        </div>
      </div>

      {/* ── Key management strip: server has no keys ── */}
      <div className={styles.keysRow}>
        <span className={styles.keysLabel}>Keys never reach the server</span>
        <div className={styles.keysTrack}>
          <span className={styles.keyNode}>Master key (KMS)</span>
          <span className={styles.keyArrow}>→</span>
          <span className={styles.keyNode}>DEK in encryption.__keyVault</span>
          <span className={styles.keyArrow}>→</span>
          <span className={styles.keyNode}>used client-side only</span>
        </div>
      </div>

      <p className={styles.caption}>
        Data is encrypted in transit, at rest, in memory, in logs and in backups —
        and stays equality- and range-queryable. The operator and the cloud only
        ever hold ciphertext.
      </p>
    </div>
  );
}
