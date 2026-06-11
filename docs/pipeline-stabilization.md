# Catalog pipeline stabilization (migration 052)

This change makes the `/admin/catalog/pipeline` actions production-safe at the
~190k-product scale and adds explicit migration diagnostics.

## Why the pipeline cards were returning 500 / "Server Components render"

The category actions **«Фіналізація каталогу»**, **«Прив'язка категорій»**,
**«Виправлення назв категорій»** all called `backfillCategorySlugs()`, which
paginated the **entire** `supplier_products` (~190k rows) **and**
`catalog_products` (~190k rows) tables into in-memory JS Maps inside a single
serverless invocation. On Vercel this exceeds the function memory/time limit, so
the process is killed — an `OOM`/timeout that a `try/catch` **cannot** catch.
The dead invocation returns HTTP 500, which the client surfaces as
"An error occurred in the Server Components render".

The **manual seed** card failed for a different reason: when migration 051 was
not applied in production, the upsert referenced columns that did not exist and
returned a cryptic PostgREST error.

## What changed

| Area | Fix |
| --- | --- |
| Backfill | `backfillCategorySlugs()` now calls the **set-based** SQL function `backfill_category_slugs()` (migration 052). No rows are transferred to the function. Manual products are never touched. |
| Finalize | Adds a `catalog_categories.source` precheck (clear error if migration missing) and counts merged products with a HEAD `count` instead of loading every moved row. |
| Seed | Adds a 051-column precheck that returns an actionable "apply 051/052" message instead of a raw PostgREST error. |
| Diagnostics | New `lib/catalog/diagnostics.ts` + `pipeline_diagnostics()` SQL function report which migrations/columns are effectively applied. Surfaced in the admin UI card **«Стан міграцій бази даних»** and at `GET /api/admin/catalog/diagnostics`. |
| UI | Cards consolidated into sections (Імпорт/публікація · Категорії · Ручний каталог · SEO). The duplicate **«Повна нормалізація категорій»** card was removed. Seed/Finalize/Backfill buttons disable themselves with a clear hint when their required migration is missing. |
| Migrations | `052_pipeline_safety.sql` idempotently **re-asserts** all columns from 047–051, so applying just 052 repairs a DB where earlier migrations were skipped. |

## Migration 050 (price backfill) idempotency

`050_finish_price_backfill.sql` is safe to run multiple times: it only fills
`price_uah` where the current value is invalid (`NULL` or `< 10`), recomputes
`price_win_field` / `supplier_price_currency` deterministically from `raw_data`,
and recomputes `is_price_suspicious`. USD prices are converted with the row's own
rate (or the prevailing FX mode), never written raw. Valid prices are never
overwritten. The diagnostics report shows how many `supplier_products` still lack
a `price_win_field` so you know whether 050 needs to be (re-)run.

## Deploy steps (after merge)

1. **Apply migrations in order** in Supabase → SQL editor. If the DB is behind,
   it is enough to apply:
   - `supabase/migrations/050_finish_price_backfill.sql` (price data, if not yet run)
   - `supabase/migrations/052_pipeline_safety.sql` (re-asserts 047–051 columns + adds the functions)
2. Open `/admin/catalog/pipeline` → the **«Стан міграцій бази даних»** card must
   show ✓ for all migrations. If not, it lists the exact missing columns/files.
3. Run the category section in order: feed diagnostic → repair names → finalize → backfill.
4. Run **«Ручний каталог (seed)»** (idempotent).
5. Headless check: `curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/catalog/diagnostics`

## Safety notes

- `SUPPLIER_ORDER_MODE` is untouched and stays `test` until explicitly changed.
- No secrets are hardcoded; all are read from env.
- No n8n / workflow logic touched.
- Booking flows and order-creation logic untouched.
- Supplier sync still tolerates missing price-trace columns (existing 42703 fallback).
