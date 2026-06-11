-- Migration 052: Pipeline safety + diagnostics
--
-- Purpose (production stabilization):
--   1. Re-assert every column the catalog pipeline depends on (idempotent), so a
--      single "apply 052" guarantees migrations 047–051 are effectively present.
--      This fixes the production state where some earlier migrations were never
--      applied and pipeline actions failed with cryptic "column does not exist".
--   2. Provide a SET-BASED backfill function so the category-slug backfill runs
--      entirely inside Postgres instead of loading ~190k+190k rows into a single
--      serverless function (the previous in-memory approach OOM-killed the
--      function, surfacing as a 500 / "Server Components render" error on the
--      "Фіналізація каталогу" and backfill cards).
--   3. Provide a read-only diagnostics function the admin UI calls to report
--      exactly which migrations/columns are effectively applied.
--
-- Idempotent — safe to re-run.

-- ─── 1. Re-assert pipeline columns (defensive, idempotent) ───────────────────

-- 047: supplier order forwarding fields on orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS receiver_first_name        text,
  ADD COLUMN IF NOT EXISTS receiver_last_name         text,
  ADD COLUMN IF NOT EXISTS receiver_patronymic        text,
  ADD COLUMN IF NOT EXISTS method_payment             text,
  ADD COLUMN IF NOT EXISTS nova_poshta_warehouse_id   text,
  ADD COLUMN IF NOT EXISTS nova_poshta_warehouse_name text,
  ADD COLUMN IF NOT EXISTS supplier_order_id          text,
  ADD COLUMN IF NOT EXISTS supplier_order_mode        text,
  ADD COLUMN IF NOT EXISTS supplier_order_status      text,
  ADD COLUMN IF NOT EXISTS supplier_order_response    jsonb;

-- 048/049: price traceability + suspicious flag + auto-SEO marker
ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS price_win_field         text,
  ADD COLUMN IF NOT EXISTS supplier_price_currency text;

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS is_price_suspicious boolean NOT NULL DEFAULT false;

ALTER TABLE catalog_categories
  ADD COLUMN IF NOT EXISTS meta_auto_generated boolean NOT NULL DEFAULT false;

-- 051: manual catalog layer
ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS source        text    NOT NULL DEFAULT 'supplier',
  ADD COLUMN IF NOT EXISTS price_prefix  text,
  ADD COLUMN IF NOT EXISTS unit_label    text,
  ADD COLUMN IF NOT EXISTS inquiry_only  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_type     text,
  ADD COLUMN IF NOT EXISTS options       jsonb;

ALTER TABLE catalog_categories
  ADD COLUMN IF NOT EXISTS source    text NOT NULL DEFAULT 'supplier',
  ADD COLUMN IF NOT EXISTS lead_type text;

-- Domain constraints (idempotent)
ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_source_check;
ALTER TABLE catalog_products
  ADD CONSTRAINT catalog_products_source_check CHECK (source IN ('supplier', 'manual'));

ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_lead_type_check;
ALTER TABLE catalog_products
  ADD CONSTRAINT catalog_products_lead_type_check
  CHECK (lead_type IS NULL OR lead_type IN ('natural_products', 'metal'));

ALTER TABLE catalog_categories DROP CONSTRAINT IF EXISTS catalog_categories_source_check;
ALTER TABLE catalog_categories
  ADD CONSTRAINT catalog_categories_source_check CHECK (source IN ('supplier', 'manual'));

-- Manual products: nullable price + sku
ALTER TABLE catalog_products ALTER COLUMN price_uah    DROP NOT NULL;
ALTER TABLE catalog_products ALTER COLUMN supplier_sku DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_products_source   ON catalog_products(source);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_source ON catalog_categories(source);

-- ─── 2. Unique slug indexes required by the idempotent manual seed upserts ────
-- onConflict:'slug' needs a unique index. Create only when no duplicates exist
-- so we never error on legacy data; if a unique constraint already exists under
-- another name this is simply redundant.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM catalog_categories WHERE slug IS NOT NULL GROUP BY slug HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_categories_slug ON catalog_categories(slug);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM catalog_products WHERE slug IS NOT NULL GROUP BY slug HAVING count(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_catalog_products_slug ON catalog_products(slug);
  END IF;
END $$;

-- ─── 3. Set-based category-slug backfill ─────────────────────────────────────
-- Replaces the in-memory TypeScript backfill. Runs as a single UPDATE inside
-- Postgres — no row transfer to the serverless function. Manual products
-- (source='manual') are never touched. Returns the number of rows updated.
CREATE OR REPLACE FUNCTION public.backfill_category_slugs()
RETURNS TABLE(updated_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated bigint;
BEGIN
  WITH upd AS (
    UPDATE catalog_products cp
    SET category_slug = cc.slug,
        updated_at    = now()
    FROM supplier_products sp
    JOIN catalog_categories cc
      ON cc.supplier_category_id = sp.supplier_category_id
    WHERE cp.supplier_sku = sp.supplier_sku
      AND cp.source = 'supplier'
      AND cp.category_slug IS DISTINCT FROM cc.slug
    RETURNING cp.id
  )
  SELECT count(*) INTO v_updated FROM upd;

  updated_count := COALESCE(v_updated, 0);
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_category_slugs() TO service_role, authenticated, anon;

-- ─── 4. Read-only diagnostics ────────────────────────────────────────────────
-- Reports which pipeline columns/functions are effectively applied. The admin UI
-- calls this via rpc('pipeline_diagnostics'). All checks use the catalog (no
-- table scans except the small price-backfill data count).
CREATE OR REPLACE FUNCTION public.pipeline_diagnostics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cols AS (
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  )
  SELECT jsonb_build_object(
    'version', 52,
    'columns', jsonb_build_object(
      'orders.supplier_order_id',            EXISTS(SELECT 1 FROM cols WHERE table_name='orders'             AND column_name='supplier_order_id'),
      'orders.supplier_order_mode',          EXISTS(SELECT 1 FROM cols WHERE table_name='orders'             AND column_name='supplier_order_mode'),
      'orders.supplier_order_status',        EXISTS(SELECT 1 FROM cols WHERE table_name='orders'             AND column_name='supplier_order_status'),
      'orders.supplier_order_response',      EXISTS(SELECT 1 FROM cols WHERE table_name='orders'             AND column_name='supplier_order_response'),
      'orders.method_payment',               EXISTS(SELECT 1 FROM cols WHERE table_name='orders'             AND column_name='method_payment'),
      'orders.nova_poshta_warehouse_id',     EXISTS(SELECT 1 FROM cols WHERE table_name='orders'             AND column_name='nova_poshta_warehouse_id'),
      'orders.receiver_first_name',          EXISTS(SELECT 1 FROM cols WHERE table_name='orders'             AND column_name='receiver_first_name'),
      'supplier_products.price_win_field',   EXISTS(SELECT 1 FROM cols WHERE table_name='supplier_products'  AND column_name='price_win_field'),
      'supplier_products.supplier_price_currency', EXISTS(SELECT 1 FROM cols WHERE table_name='supplier_products' AND column_name='supplier_price_currency'),
      'catalog_products.is_price_suspicious',EXISTS(SELECT 1 FROM cols WHERE table_name='catalog_products'   AND column_name='is_price_suspicious'),
      'catalog_categories.meta_auto_generated', EXISTS(SELECT 1 FROM cols WHERE table_name='catalog_categories' AND column_name='meta_auto_generated'),
      'catalog_products.source',             EXISTS(SELECT 1 FROM cols WHERE table_name='catalog_products'   AND column_name='source'),
      'catalog_products.price_prefix',       EXISTS(SELECT 1 FROM cols WHERE table_name='catalog_products'   AND column_name='price_prefix'),
      'catalog_products.unit_label',         EXISTS(SELECT 1 FROM cols WHERE table_name='catalog_products'   AND column_name='unit_label'),
      'catalog_products.inquiry_only',       EXISTS(SELECT 1 FROM cols WHERE table_name='catalog_products'   AND column_name='inquiry_only'),
      'catalog_products.lead_type',          EXISTS(SELECT 1 FROM cols WHERE table_name='catalog_products'   AND column_name='lead_type'),
      'catalog_products.options',            EXISTS(SELECT 1 FROM cols WHERE table_name='catalog_products'   AND column_name='options'),
      'catalog_categories.source',           EXISTS(SELECT 1 FROM cols WHERE table_name='catalog_categories' AND column_name='source'),
      'catalog_categories.lead_type',        EXISTS(SELECT 1 FROM cols WHERE table_name='catalog_categories' AND column_name='lead_type')
    ),
    'functions', jsonb_build_object(
      'backfill_category_slugs', EXISTS(
        SELECT 1 FROM pg_proc WHERE proname = 'backfill_category_slugs'
      )
    ),
    'data', jsonb_build_object(
      -- >0 means migration 050 (price backfill) has rows still missing a win field.
      'supplier_products_missing_win_field', (
        SELECT count(*) FROM supplier_products
        WHERE price_win_field IS NULL AND raw_data IS NOT NULL
      )
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.pipeline_diagnostics() TO service_role, authenticated, anon;
