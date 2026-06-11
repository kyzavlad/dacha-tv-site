-- Migration 048: Catalog foundation fixes
-- 1. Fix supplier_sync_log.status constraint to include 'stale' (code writes it but constraint rejected it)
-- 2. Add price_win_field to supplier_products for price-source traceability
-- 3. Add supplier_price_currency to know if price came from USD or UAH source
-- 4. Add is_price_suspicious to catalog_products so UI can suppress buy CTA for unconverted prices
-- Idempotent — safe to re-run.

-- ─── Fix stale status constraint ─────────────────────────────────────────────
-- The code in sync.ts writes 'stale' for stuck runs but the DB rejects it.
ALTER TABLE supplier_sync_log
  DROP CONSTRAINT IF EXISTS supplier_sync_log_status_check;

ALTER TABLE supplier_sync_log
  ADD CONSTRAINT supplier_sync_log_status_check
  CHECK (status IN ('running', 'completed', 'failed', 'stale'));

-- ─── Price traceability on supplier_products ──────────────────────────────────
-- price_win_field: which API field won the price resolution
--   'price_uah'      → API had explicit UAH price, trusted as-is
--   'retail_price'   → API had retail_price field, assumed UAH (may be wrong if feed is USD-native)
--   'price_usd*rate' → converted from explicit price_usd field
--   'price*rate'     → converted from generic price field using exchange rate
--   'rate_missing'   → had a price value but no exchange rate, could not safely convert
-- supplier_price_currency: 'UAH' if we treated price as UAH, 'USD' if we converted from USD
ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS price_win_field      text,
  ADD COLUMN IF NOT EXISTS supplier_price_currency text;  -- 'UAH' | 'USD' | null (unknown)

-- ─── Suspicious price flag on catalog_products ───────────────────────────────
-- True when: price was stored from a non-USD-converted source AND price_uah < 100 UAH.
-- These products get a "Уточнити ціну" CTA instead of "Add to cart" until recalculated.
ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS is_price_suspicious boolean NOT NULL DEFAULT false;

-- Back-fill: mark existing catalog_products as suspicious if their supplier_product
-- has price_uah < 100 AND supplier_price_usd IS NULL (meaning no USD conversion was applied).
-- This catches products where retail_price was stored as-is without knowing if it was USD.
UPDATE catalog_products cp
SET is_price_suspicious = true
FROM supplier_products sp
WHERE cp.supplier_sku = sp.supplier_sku
  AND cp.price_uah < 100
  AND sp.supplier_price_usd IS NULL
  AND cp.price_uah >= 10;   -- keep the < 10 ones blocked by hasValidPrice already

-- ─── Category auto-SEO columns ───────────────────────────────────────────────
-- meta_auto_generated marks rows whose SEO was auto-filled (not hand-written).
-- The CSV override logic should only overwrite auto-generated rows, never manual ones.
ALTER TABLE catalog_categories
  ADD COLUMN IF NOT EXISTS meta_auto_generated boolean NOT NULL DEFAULT false;
