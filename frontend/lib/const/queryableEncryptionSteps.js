// Step definitions for the Queryable Encryption Explorer walkthrough.
// Each step progressively reveals MongoDB Queryable Encryption concepts,
// framed around CIM-shaped grid data crossing operators, market parties and
// the cloud — where no one should have to be trusted with the plaintext.

export const QE_STEPS = [
  {
    id: "metering_point",
    num: 1,
    title: "The Metering Point",
    sentence:
      "One CIM-conformant metering point — the shared record a DSO and a TSO exchange.",
    collection: "metering_points",
    pipeline: [{ $limit: 1 }],
    description:
      "Grid interoperability rests on a common information model (IEC 61968/61970). Every metering point is exchanged as the same shape: a stable metering point id, the consumption it measured, the service address and its customer segment. Here that record sits in plaintext — anyone with database access reads every field in the clear.",
  },
  {
    id: "exposure",
    num: 2,
    title: "The Interoperability Gap",
    sentence:
      "Grid data now crosses operators, market parties and the cloud — but at-rest encryption still decrypts it for every query.",
    collection: "metering_points",
    pipeline: [
      {
        $project: {
          metering_point_id: 1,
          consumption_kwh: 1,
          service_address: 1,
          customer_name: 1,
        },
      },
      { $limit: 10 },
    ],
    prevStepId: "metering_point",
    description:
      "Interoperability means the same metering data is consumed by DSOs, TSOs, market operators and third-party analytics — often in someone else's cloud. Disk-level encryption (TDE) doesn't help: the database must decrypt a field to filter or sort on it, so the plaintext is live in memory for every query. A compromised admin, an over-broad role, or a leaked backup exposes every metering point. National critical-infrastructure rules (e.g. NIS2) increasingly demand that even the operator cannot read the sensitive fields. That is the gap Queryable Encryption closes.",
  },
  {
    id: "encrypted",
    num: 3,
    title: "The Encrypted Record",
    star: true,
    sentence:
      "The same metering point — the id and consumption are ciphertext on the server, the rest stays queryable.",
    collection: "metering_points_encrypted",
    mode: "encrypted_find",
    query: {},
    options: { limit: 1 },
    pipeline: [{ $limit: 1 }],
    prevStepId: "exposure",
    description:
      "With Queryable Encryption, the sensitive CIM fields — the metering point id and its consumption — are encrypted client-side and stored as Binary ciphertext. The server never sees the plaintext: not in memory, not in logs, not in backups. Non-sensitive context (segment, region, address) stays plaintext so operational dashboards keep working.",
  },
  {
    id: "equality",
    num: 4,
    title: "Equality Search",
    sentence:
      "Look up a metering point by its CIM id — the query token is encrypted client-side and matched server-side.",
    collection: "metering_points_encrypted",
    mode: "encrypted_find",
    query: { metering_point_id: "MP-000001" },
    options: { limit: 1 },
    pipeline: [
      {
        $match: { metering_point_id: "MP-000001" },
      },
      { $limit: 1 },
    ],
    prevStepId: "encrypted",
    description:
      "A TSO asking for one metering point sends its CIM id; the client encrypts it before it leaves the application. MongoDB matches the encrypted query token against encrypted index entries — no decryption on the server — and the result is decrypted client-side. The operator and the cloud only ever see ciphertext.",
  },
  {
    id: "range",
    num: 5,
    title: "Range Query",
    sentence:
      "Find metering points above a consumption threshold — range comparisons work on encrypted fields too.",
    collection: "metering_points_encrypted",
    mode: "encrypted_find",
    query: { consumption_kwh: { $gte: 200 } },
    options: { limit: 10 },
    pipeline: [
      {
        $match: { consumption_kwh: { $gte: 200 } },
      },
      { $sort: { consumption_kwh: -1 } },
      { $limit: 10 },
    ],
    prevStepId: "equality",
    description:
      "Queryable Encryption supports range queries on encrypted numeric fields. The server evaluates $gte, $lte, $gt, $lt against ciphertext using special encrypted index structures — without ever learning the values. Grid use: load profiling and capacity planning across the fleet, with no per-meter consumption exposed.",
  },
  {
    id: "why",
    num: 6,
    title: "Why QE for the Grid",
    sentence:
      "CIM-shaped data stays queryable across operators — without anyone having to be trusted with the plaintext.",
    collection: "metering_points_encrypted",
    mode: "encrypted_find",
    query: {},
    options: { limit: 5, projection: { metering_point_id: 1, consumption_kwh: 1, segment: 1 } },
    pipeline: [
      {
        $project: {
          metering_point_id: 1,
          consumption_kwh: 1,
          segment: 1,
        },
      },
      { $limit: 5 },
    ],
    prevStepId: "range",
    description:
      "Queryable Encryption gives national grid infrastructure defense-in-depth: data is encrypted in transit, at rest, in memory, in logs and in backups, while staying equality- and range-queryable. DSOs, TSOs, market operators and cloud analytics all speak the same CIM shape — and none of them has to be trusted with the plaintext. That is the difference between 'trust the operator' and 'don't have to.'",
  },
];
