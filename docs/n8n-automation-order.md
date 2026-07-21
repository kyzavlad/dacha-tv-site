# Daily catalog automation — recommended n8n order (Section H)

**Do NOT activate workflows** from this repo. This documents the exact sequence
and the read-only verification to run first. All steps are idempotent and
resumable; each is a bounded batch so a single run never loads the whole feed.

## Pre-flight (read-only)

Run `npx tsx scripts/diagnose-automation.ts` (never writes) to verify:
`supplier_sync_state` exists and holds a resume cursor; category/product counts;
manual + metal protection; stock columns present; price/image lock counts. Run
`npx tsx scripts/diagnose-supplier-errors.ts` to classify the last cycle’s errors.

## Recommended n8n sequence (each node = one bounded call)

1. **Resumable supplier raw sync** — `syncSupplierProducts` (windowed). Runs every
   ~15 min; persists `supplier_sync_state.next_offset` and resumes there until the
   feed cycle completes (`next_offset = null`). Writes `completed_with_errors` +
   `errorGroups` to `supplier_sync_log`. Does **not** touch catalog rows.
2. **Refresh existing catalog products** — `syncProductsToCatalog(limit)`. Updates
   price / images / **stock** on rows already in `catalog_products` (source≠manual,
   respecting `price_manual_lock` / `image_manual_lock`). Never blocked by the
   published cap. Manual + metal rows are never touched.
3. **Import new products as drafts** — same `syncProductsToCatalog` call; new rows
   land as `status='draft'`, `is_approved` flips only for confirmed rows. New
   insertion (only) is gated by `AUTOMATION_MAX_PUBLISHED`. Continue while
   `remaining > 0` (drive on `approved`, never on `inserted`).
4. **UA Product SEO** — generate Ukrainian meta/description for draft rows lacking
   it (bounded batch).
5. **RU Product SEO** — upsert `catalog_product_translations(locale='ru')`
   (bounded batch).
6. **EN translation / SEO** — bounded candidate→apply into
   `catalog_product_translations(locale='en')`; never all 112k in one request
   (see `docs/localization-coverage.md`).
7. **Publish only SEO-ready drafts** — `publishDraftProducts({ quality: true })`:
   flips to `published` only rows with image + meta_title + meta_description.
8. **Telegram report** — post per-cycle summary: processed / inserted / updated /
   approved / remaining, and the CLEARLY SEPARATED failure fields:
   `hard_errors` (real DB/write failures), `diagnostic_issues` (non-fatal
   data-quality: missing_sku/duplicate_sku_in_feed/invalid_record/invalid_price),
   `errorGroups` (per-category counts, always present), and
   `completed_with_errors` (true only when `hard_errors > 0`).

## Loop / cadence

- Node 1 re-fires every 15 min until `supplier_sync_state.next_offset = null`
  (cycle complete), then nodes 2–8 run once per completed cycle.
- Nodes 2–3 loop internally until `remaining = 0`.
- Every node is idempotent; a failed run is safe to re-run.

## Invariants the automation must preserve (verified read-only)

- `source='manual'` and `lead_type='metal'` rows are never modified by any node.
- `price_manual_lock` / `image_manual_lock` win against refresh (guarded UPDATE
  re-checks the lock in its WHERE clause).
- `stock_quantity` never negative; `is_in_stock` + `stock_synced_at` propagate to
  `catalog_products`; missing/invalid supplier stock → 0 / out-of-stock.
- Published cap gates only NEW insertion/publication, never the daily refresh.
- Checkout / orders / analytics behavior is unchanged.
