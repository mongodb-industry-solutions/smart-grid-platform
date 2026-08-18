# Maintenance insights

## TO-DO

- [ ] **Switch the demo owner/user to Energy.** The demo currently runs under the
  existing user (created for the interns); it needs to be moved to the **Energy** user/account.
- [ ] **Implement the E2E test scenarios.** The scenarios are already written in
  [`E2E_TEST_SCENARIOS.md`](E2E_TEST_SCENARIOS.md) (Given/When/Then) — they still
  need to be built out as actual automated tests.

---

## KB search indexes on a DB migration (IST-shared → IST-prod)

During the migration of the database from **IST-shared** to **IST-prod**
(`atlas-jm0bot`), the AI agent's **Atlas Search indexes had to be recreated by
hand**, and the newer cluster rejected the definitions the code ships with.

### Why the indexes needed to be recreated

Atlas **Search / Vector Search indexes are per-cluster** — they are *not* carried
over by a data migration (copying documents doesn't copy search indexes). The
`kb_articles` collection came across with its documents, but its two search
indexes (`kb_text_index`, `kb_vector_index`) did not, so the agent's
`$search` / `$vectorSearch` queries had nothing to hit.

> These indexes are normally created by `frontend/scripts/seedKnowledgeBase.mjs`
> (run automatically by the Start Demo "kb" step). On a migration where the data
> already exists, you only need the indexes — but the seed's definitions are stale
> for newer clusters (see below).

### Two differences on the newer Atlas Search version

The IST-prod cluster runs a newer Atlas Search version with different
auto-embedding syntax than what the seed script uses:

| | Old (code / IST-shared) | New (IST-prod, `atlas-jm0bot`) |
|---|---|---|
| Vector field type | `type: "text"` | `type: "autoEmbed"` + `modality: "text"` |
| Embedding model | `voyage-3-large` | voyage-4 family only: `voyage-4`, `voyage-4-large`, `voyage-4-lite`, `voyage-code-3` |

Errors seen when using the old definition:
- `Unsupported field type 'text' in index: kb_vector_index. Please use type 'autoEmbed' with 'modality: text' instead.`
- `Unsupported model 'voyage-3-large' in index: kb_vector_index. Supported models are: [voyage-4, voyage-code-3, voyage-4-large, voyage-4-lite]`

### Commands that worked (mongosh)

```javascript
use smart_grid_platform

// Text index — unchanged, accepted as-is.
db.kb_articles.createSearchIndex(
  "kb_text_index",
  {
    mappings: {
      dynamic: false,
      fields: {
        title:    { type: "string" },
        text:     { type: "string" },
        category: { type: "string" }
      }
    }
  }
)

// Vector index — new auto-embedding syntax + voyage-4 model.
db.kb_articles.createSearchIndex(
  "kb_vector_index",
  "vectorSearch",
  {
    fields: [
      {
        type: "autoEmbed",
        path: "text",
        modality: "text",
        model: "voyage-4-large",
        similarity: "dotProduct"
      }
    ]
  }
)
```

Verify until both report `status: "READY"` / `queryable: true`:

```javascript
db.kb_articles.aggregate([{ $listSearchIndexes: {} }])
```

### Notes for the next maintainer

- **No app code change is required to query.** `$vectorSearch` only references the
  index by **name** (`kb_vector_index`), and Atlas embeds the query text with the
  model stored *in the index* — so the agent works the same whether the index was
  built with `voyage-3-large` or `voyage-4-large`.
- **The seed script is stale for newer clusters.** `seedKnowledgeBase.mjs` still
  uses `type: "text"` + `voyage-3-large`, so its vector-index creation will fail on
  IST-prod-style clusters with the two errors above. If we standardize on these
  clusters, update the seed to `type: "autoEmbed"` + `modality: "text"` and a
  voyage-4 model (e.g. via `VOYAGE_MODEL=voyage-4-large`).
- **Index names are the contract.** Keep them exactly `kb_text_index` and
  `kb_vector_index` — those literals are what `frontend/lib/ai/knowledgeBase.js`
  queries.
- Auto-embedding requires the Atlas **project** to have the Voyage integration
  available; the supported model list is dictated by the cluster/project, not by us.
- The screenshot below captures the exact mongosh session.

![alt text](<Screenshot 2026-08-18 at 11.26.50 AM.png>)

