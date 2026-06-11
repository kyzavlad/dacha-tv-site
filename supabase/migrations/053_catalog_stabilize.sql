-- Migration 053: Catalog stabilization (consolidating) + honey pricing
--
-- Production reality: migrations 051/052 were merged but not reliably applied in
-- the Supabase SQL editor, so pipeline actions failed:
--   • Manual seed   → manual columns missing / price_uah & supplier_sku NOT NULL
--                     (inquiry products have NULL price) → insert errors.
--   • Backfill slugs→ backfill_category_slugs() function missing.
--   • Finalize/Repair categories → depend on catalog_categories.source.
--
-- This migration RE-ASSERTS everything 047–052 need, idempotently, so applying
-- 053 alone brings production to a known-good state. It then sets honey pricing.
--
-- Idempotent — safe to re-run.

-- ─── 1. Columns 047–051 (idempotent) ─────────────────────────────────────────
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

ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS price_win_field         text,
  ADD COLUMN IF NOT EXISTS supplier_price_currency text;

ALTER TABLE catalog_products
  ADD COLUMN IF NOT EXISTS is_price_suspicious boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source        text    NOT NULL DEFAULT 'supplier',
  ADD COLUMN IF NOT EXISTS price_prefix  text,
  ADD COLUMN IF NOT EXISTS unit_label    text,
  ADD COLUMN IF NOT EXISTS inquiry_only  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_type     text,
  ADD COLUMN IF NOT EXISTS options       jsonb;

ALTER TABLE catalog_categories
  ADD COLUMN IF NOT EXISTS meta_auto_generated boolean NOT NULL DEFAULT false,
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

-- Manual products: NULLable price + sku (inquiry-only products have no price;
-- manual products have no supplier SKU). Multiple NULLs are allowed by the
-- existing UNIQUE(supplier_sku) constraint, so manual rows never collide.
ALTER TABLE catalog_products ALTER COLUMN price_uah    DROP NOT NULL;
ALTER TABLE catalog_products ALTER COLUMN supplier_sku DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_catalog_products_source   ON catalog_products(source);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_source ON catalog_categories(source);

-- ─── 2. Set-based category-slug backfill (re-assert) ─────────────────────────
-- Runs entirely inside Postgres — never transfers ~190k rows to the function.
-- Manual products (source='manual') are NEVER touched.
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

-- ─── 3. Read-only diagnostics (re-assert) ────────────────────────────────────
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
    'version', 53,
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
      'backfill_category_slugs', EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'backfill_category_slugs')
    ),
    'data', jsonb_build_object(
      'supplier_products_missing_win_field', (
        SELECT count(*) FROM supplier_products
        WHERE price_win_field IS NULL AND raw_data IS NOT NULL
      )
    )
  );
$$;
GRANT EXECUTE ON FUNCTION public.pipeline_diagnostics() TO service_role, authenticated, anon;

-- ─── 4. Honey pricing (UAH per liter) ────────────────────────────────────────
-- Acacia & linden 600, sunflower 300, all other honey 400. price_plastic_uah and
-- price_glass_uah are kept equal (unified pricing, as migration 036 established).
UPDATE honey_products SET price_plastic_uah = 400, price_glass_uah = 400;
UPDATE honey_products SET price_plastic_uah = 600, price_glass_uah = 600
  WHERE slug IN ('acacia-honey', 'linden-honey');
UPDATE honey_products SET price_plastic_uah = 300, price_glass_uah = 300
  WHERE slug = 'sunflower-honey';
