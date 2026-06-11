-- Migration 051: Manual catalog layer
-- Adds manually-curated products & categories that coexist with the supplier
-- API catalog inside the same /catalog shop.
--
-- Why manual rows are safe from supplier sync:
--   • Supplier sync only ever writes supplier_products (onConflict: supplier_sku)
--     and the pipeline promotes those into catalog_products keyed by supplier_sku.
--   • Manual products carry source='manual' and a NULL supplier_sku, so the
--     supplier upsert key never matches them — they are structurally untouchable
--     by any sync/promotion pass.
--
-- Idempotent — safe to re-run.

-- ─── catalog_products: manual-friendly columns ───────────────────────────────
ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS source        text    NOT NULL DEFAULT 'supplier',
  ADD COLUMN IF NOT EXISTS price_prefix  text,    -- e.g. "від"
  ADD COLUMN IF NOT EXISTS unit_label    text,    -- e.g. "грн/кг", "грн/м²", "грн/лист"
  ADD COLUMN IF NOT EXISTS inquiry_only  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_type     text,    -- 'natural_products' | 'metal' (manual leads routing)
  ADD COLUMN IF NOT EXISTS options       jsonb;   -- colors, thicknesses, coatings, sizes, packaging, …

-- source domain
ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_source_check;
ALTER TABLE catalog_products
  ADD CONSTRAINT catalog_products_source_check CHECK (source IN ('supplier', 'manual'));

-- lead_type domain (nullable)
ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_lead_type_check;
ALTER TABLE catalog_products
  ADD CONSTRAINT catalog_products_lead_type_check
  CHECK (lead_type IS NULL OR lead_type IN ('natural_products', 'metal'));

-- Manual products may be inquiry-only (no price) and have no supplier SKU.
-- The UNIQUE constraint on supplier_sku stays — Postgres allows multiple NULLs,
-- so any number of manual products with NULL sku coexist without collision.
ALTER TABLE catalog_products ALTER COLUMN price_uah    DROP NOT NULL;
ALTER TABLE catalog_products ALTER COLUMN supplier_sku DROP NOT NULL;

-- ─── catalog_categories: manual-friendly columns ─────────────────────────────
ALTER TABLE catalog_categories
  ADD COLUMN IF NOT EXISTS source    text NOT NULL DEFAULT 'supplier',
  ADD COLUMN IF NOT EXISTS lead_type text;

ALTER TABLE catalog_categories DROP CONSTRAINT IF EXISTS catalog_categories_source_check;
ALTER TABLE catalog_categories
  ADD CONSTRAINT catalog_categories_source_check CHECK (source IN ('supplier', 'manual'));

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_catalog_products_source   ON catalog_products(source);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_source ON catalog_categories(source);
