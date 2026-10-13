// Step definitions for the Queryable Encryption Explorer walkthrough.
// Each step progressively reveals MongoDB Queryable Encryption concepts,
// showing how sensitive customer data can be protected while remaining queryable.

export const QE_STEPS = [
  {
    id: "customer",
    num: 1,
    title: "The Customer",
    sentence:
      "A single customer record — name, address, SSN, billing details, all in plaintext.",
    collection: "customer_db",
    pipeline: [{ $limit: 1 }],
    description:
      "This is a typical customer document stored in MongoDB. Notice the sensitive fields: SSN, billing amount, payment method. Anyone with database access can read every field in the clear.",
  },
  {
    id: "exposure",
    num: 2,
    title: "The Exposure",
    sentence:
      "A rogue aggregation extracts every customer's SSN and billing details in seconds.",
    collection: "customer_db",
    pipeline: [
      {
        $project: {
          name: 1,
          ssn: 1,
          billing_amount: 1,
          payment_method: 1,
          address: 1,
        },
      },
      { $limit: 10 },
    ],
    prevStepId: "customer",
    description:
      "With plaintext storage, a single $project is enough to extract every customer's PII. A compromised admin, a leaked backup, or a misconfigured role — and all data is exposed. This is the problem Queryable Encryption solves.",
  },
  {
    id: "encrypted",
    num: 3,
    title: "The Encrypted Doc",
    star: true,
    sentence:
      "The same customer record, but SSN and billing fields are encrypted at rest — opaque binary on the server.",
    collection: "customer_db_encrypted",
    mode: "encrypted_find",
    query: {},
    options: { limit: 1 },
    pipeline: [{ $limit: 1 }],
    prevStepId: "exposure",
    description:
      "With Queryable Encryption enabled, sensitive fields are stored as encrypted Binary blobs. The server never sees the plaintext — not in memory, not in logs, not in backups. Only an authorized client with the correct encryption keys can decrypt.",
  },
  {
    id: "equality",
    num: 4,
    title: "Equality Search",
    sentence:
      "Find a customer by SSN — the query value is encrypted client-side, matched server-side, and decrypted on return.",
    collection: "customer_db_encrypted",
    mode: "encrypted_find",
    query: { ssn: "###-##-####" },
    options: { limit: 1 },
    pipeline: [
      {
        $match: { ssn: "###-##-####" },
      },
      { $limit: 1 },
    ],
    prevStepId: "encrypted",
    description:
      "The client encrypts the search value before sending it to the server. MongoDB matches the encrypted query token against encrypted index entries — no decryption on the server. The result is decrypted client-side. The server only ever sees ciphertext.",
  },
  {
    id: "range",
    num: 5,
    title: "Range Query",
    sentence:
      "Find customers with high billing amounts — range comparisons work on encrypted fields too.",
    collection: "customer_db_encrypted",
    mode: "encrypted_find",
    query: { billing_amount: { $gte: 200 } },
    options: { limit: 10 },
    pipeline: [
      {
        $match: { billing_amount: { $gte: 200 } },
      },
      { $sort: { billing_amount: -1 } },
      { $limit: 10 },
    ],
    prevStepId: "equality",
    description:
      "Queryable Encryption supports range queries on encrypted numeric and date fields. The server evaluates $gte, $lte, $gt, $lt on ciphertext using special encrypted index structures — without ever learning the actual values.",
  },
  {
    id: "why",
    num: 6,
    title: "Why QE",
    sentence:
      "Encrypt sensitive fields, keep them queryable — protection against breaches, insiders, and cloud exposure.",
    collection: "customer_db_encrypted",
    mode: "encrypted_find",
    query: {},
    options: { limit: 5, projection: { name: 1, ssn: 1, billing_amount: 1 } },
    pipeline: [
      {
        $project: {
          name: 1,
          ssn: 1,
          billing_amount: 1,
        },
      },
      { $limit: 5 },
    ],
    prevStepId: "range",
    description:
      "Queryable Encryption gives you defense-in-depth: data is encrypted in transit, at rest, in memory, in logs, and in backups. Only your application — with the right keys — can decrypt. The database operator, cloud provider, and even a full server compromise cannot expose the plaintext.",
  },
];
