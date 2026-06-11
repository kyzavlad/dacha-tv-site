# Manual catalog (натуральні продукти + металопрофіль)

Hand-curated products and categories that live in the same `/catalog` shop as the
supplier API catalog. Manual rows are **never** touched by supplier sync.

## How coexistence works

- `catalog_products.source` and `catalog_categories.source` distinguish `'manual'`
  from `'supplier'` (default).
- Manual products carry `source='manual'` and `supplier_sku = NULL`. Supplier sync
  only writes `supplier_products` and promotes rows into `catalog_products` keyed by
  `supplier_sku`, so a NULL sku can never collide with — and is never overwritten by —
  any sync/promotion pass.
- Category finalization (`normalizeAndFinalizeCategories`) explicitly skips
  `source='manual'` categories, so their hand-written names are never renamed,
  merged, or archived.

## New product fields (migration `051_manual_catalog.sql`)

`catalog_products`:
- `source` — `'supplier' | 'manual'`
- `price_uah` — now **nullable** (inquiry-only products)
- `supplier_sku` — now **nullable** (manual products have none)
- `price_prefix` — e.g. `від`
- `unit_label` — e.g. `грн/кг`, `грн/250 мл`, `грн/м²`, `грн/лист`, `грн/упаковка`
- `inquiry_only` — boolean
- `lead_type` — `'natural_products' | 'metal'` (Telegram routing)
- `options` — JSONB (colors, thicknesses, coatings, sizes, packaging, seasonality, delivery)

`catalog_categories`: `source`, `lead_type`.

## Price / CTA behaviour

- Real price shown only when valid and not suspicious; rendered with prefix + unit
  (e.g. `від 310 грн/м²`).
- `inquiry_only=true` **or** no price → card/detail shows **«Уточнити ціну»**.
- Normal priced products → cart / checkout.
- Inquiry-only products → inline lead form (`ManualLeadForm`) that submits a request
  routed to the correct Telegram thread by `lead_type` (never a cart order).

## Deploy steps

1. Apply the migration in the Supabase SQL editor:
   `supabase/migrations/051_manual_catalog.sql`
2. Seed the manual catalog (idempotent — safe to re-run, never duplicates):
   - Admin UI: `/admin/catalog/pipeline` → **«Ручний каталог (seed)»** → *Заповнити*, or
   - Headless:
     ```
     curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
       https://<site>/api/admin/catalog/seed-manual
     ```
3. Verify `/catalog` (manual branches appear), `/catalog/all`, a manual product page,
   and the inquiry CTA.

## Environment variables

Telegram routing for manual leads (each falls back to `TELEGRAM_CHAT_ID`):

| Variable | Purpose |
| --- | --- |
| `TELEGRAM_CHAT_ID_NATURAL` | Chat for natural-product / beekeeping leads |
| `TELEGRAM_TOPIC_NATURAL`   | Optional forum topic id (message_thread_id) for the above |
| `TELEGRAM_CHAT_ID_METAL`   | Chat for metal / profnastil / building-materials leads |
| `TELEGRAM_TOPIC_METAL`     | Optional forum topic id (message_thread_id) for the above |
| `CRON_SECRET`              | Auth for the seed/repair endpoints |

Secrets are read from env only — never hardcoded.

## Editing content

All copy lives in `lib/catalog/manual-catalog-data.ts` (Ukrainian, stable slugs).
Edit there and re-run the seed; upserts key on `slug` so content refreshes without
duplicates. Natural-product wording stays safe (no medical claims): «натуральний
продукт», «традиційно використовується», «не є лікарським засобом».
