# Supplier raw-sync errors — historical vs new (honest)

## The historical 1767

A past cycle recorded `products_errors = 1767` with **`errorGroups = null`** — the
old sync kept a bare counter and stored no categorization. **The exact
classification of those 1767 is UNAVAILABLE and has not been reconstructed.** Any
attempt to "classify" them now would be fabrication: the per-record codes/offsets
were never persisted. `scripts/diagnose-supplier-errors.ts` explicitly flags such
a run as `legacy_unclassified: true` and does **not** invent a breakdown.

What we CAN say, independently and truthfully, from live read-only queries:
- how many current `supplier_products` rows have no usable price (`invalid_price`
  candidates — unsellable, excluded from the catalog import), and
- how many have a null name (`missing_name`).

These live counts are reported under `live_data_quality` and are **not** added to
any hard database-error count.

## New cycles (classifier active)

Every new sync run now emits, in `supplier_sync_log.error_details`:
- **`hard_errors`** — real DB/write failures (`database_constraint`,
  `upsert_failed`, `unknown`). A record was NOT persisted as intended.
- **`diagnostic_issues`** — non-fatal data-quality (`missing_sku`,
  `duplicate_sku_in_feed`, `invalid_record`, `invalid_price`). Records are safely
  skipped or written without a price; these are NOT failures.
- **`errorGroups`** — per-category counts (all 7 categories), **always present**
  when there is anything to report.
- **`completed_with_errors`** — `true` **only** when `hard_errors > 0`. A benign
  diagnostic issue never flips it.

These three have clear, separate meanings and must not be conflated — the
`errors` field returned by the sync now equals `hard_errors` only.

## Retry

`isRetryableDbError` gates a bounded (≤3 attempt) retry for TRANSIENT failures
only — serialization/deadlock (40001/40P01), connection (08xxx), insufficient
resources (53xxx), cancellation (57014), and network-ish messages. Constraint
violations (23xxx) are deterministic and are **never** retried (no duplicate
creation — the upsert is idempotent on `supplier_sku`).

## Which errors are harmless vs need action

| Category | Meaning | Action |
| --- | --- | --- |
| `missing_sku` | feed record has no usable SKU | harmless — skipped |
| `invalid_record` | malformed feed record | harmless — skipped |
| `invalid_price` | built OK but no usable price | harmless — unsellable, excluded from import |
| `duplicate_sku_in_feed` | same SKU twice in one feed | harmless — first wins |
| `database_constraint` | 23xxx (unique/not-null/check/fk) | **inspect** code/message + samples; likely a schema/data fix |
| `upsert_failed` | other DB error | **inspect**; retried if transient |
| `unknown` | no code/message | **inspect** samples |

## Demonstrating the classifier without a full sync

`tests/error-grouping.test.mjs` exercises `classifyBuildFailure`,
`classifyPriceIssue`, `classifyUpsertError`, `isRetryableDbError`, and the
hard-vs-diagnostic accounting (a run with only diagnostic issues has
`completed_with_errors = false`; a single hard error flips it). This proves the
new categorization on bounded synthetic inputs — no uncontrolled feed run.
