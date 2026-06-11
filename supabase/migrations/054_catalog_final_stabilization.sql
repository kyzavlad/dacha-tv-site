-- Migration 054: Catalog final stabilization + SEO fields + category ordering
--
-- Why this exists: migration 053 failed in production with
--   relation "orders" does not exist
-- because `ALTER TABLE orders ...` errors when the base e-commerce tables were
-- never created on that instance. This migration is FULLY DEFENSIVE:
--   • Every table alteration uses `ALTER TABLE IF EXISTS` so a missing table is
--     skipped (with a notice) instead of aborting the whole script.
--   • Every data UPDATE is wrapped in a table-existence DO block.
--   • The diagnostics function reports missing REQUIRED tables instead of
--     throwing, and never assumes orders/order_items exist.
--
-- It re-asserts every column the catalog pipeline + new SEO system need across
-- catalog_categories, catalog_products, supplier_products, supplier_categories,
-- inquiries and honey_products, regardless of which earlier migrations ran.
--
-- Idempotent — safe to re-run.

-- ─── 1. orders / order_items (only if present) ───────────────────────────────
ALTER TABLE IF EXISTS orders
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

-- ─── 2. supplier_products / supplier_categories ──────────────────────────────
ALTER TABLE IF EXISTS supplier_products
  ADD COLUMN IF NOT EXISTS price_win_field         text,
  ADD COLUMN IF NOT EXISTS supplier_price_currency text,
  ADD COLUMN IF NOT EXISTS supplier_price_usd      numeric,
  ADD COLUMN IF NOT EXISTS supplier_price_rate     numeric,
  ADD COLUMN IF NOT EXISTS last_price_synced_at    timestamptz,
  ADD COLUMN IF NOT EXISTS is_approved             boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS publish_priority        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS raw_data                jsonb;

ALTER TABLE IF EXISTS supplier_categories
  ADD COLUMN IF NOT EXISTS name_ua             text,
  ADD COLUMN IF NOT EXISTS slug                text,
  ADD COLUMN IF NOT EXISTS parent_supplier_id  text,
  ADD COLUMN IF NOT EXISTS raw_data            jsonb,
  ADD COLUMN IF NOT EXISTS synced_at           timestamptz;

-- ─── 3. catalog_products: manual + pricing + SEO columns ─────────────────────
ALTER TABLE IF EXISTS catalog_products
  ADD COLUMN IF NOT EXISTS is_price_suspicious boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source        text    NOT NULL DEFAULT 'supplier',
  ADD COLUMN IF NOT EXISTS price_prefix  text,
  ADD COLUMN IF NOT EXISTS unit_label    text,
  ADD COLUMN IF NOT EXISTS inquiry_only  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lead_type     text,
  ADD COLUMN IF NOT EXISTS options       jsonb,
  ADD COLUMN IF NOT EXISTS sort_order    integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS product_group text    NOT NULL DEFAULT 'catalog',
  -- SEO system
  ADD COLUMN IF NOT EXISTS description_ua    text,
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS meta_title        text,
  ADD COLUMN IF NOT EXISTS meta_description  text,
  ADD COLUMN IF NOT EXISTS seo_keywords      text,
  ADD COLUMN IF NOT EXISTS seo_status        text    NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS seo_source        text    NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS seo_generated_at  timestamptz,
  ADD COLUMN IF NOT EXISTS seo_manual_lock   boolean NOT NULL DEFAULT false;

-- ─── 4. catalog_categories: manual + ordering + SEO columns ──────────────────
ALTER TABLE IF EXISTS catalog_categories
  ADD COLUMN IF NOT EXISTS meta_auto_generated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source    text NOT NULL DEFAULT 'supplier',
  ADD COLUMN IF NOT EXISTS lead_type text,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100,
  -- SEO system
  ADD COLUMN IF NOT EXISTS seo_title        text,
  ADD COLUMN IF NOT EXISTS seo_description  text,
  ADD COLUMN IF NOT EXISTS description_ua   text,
  ADD COLUMN IF NOT EXISTS h1               text,
  ADD COLUMN IF NOT EXISTS faq_json         jsonb,
  ADD COLUMN IF NOT EXISTS seo_keywords     text,
  ADD COLUMN IF NOT EXISTS seo_status       text    NOT NULL DEFAULT 'missing',
  ADD COLUMN IF NOT EXISTS seo_source       text    NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS seo_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS seo_manual_lock  boolean NOT NULL DEFAULT false;

-- ─── 5. inquiries: columns the lead flow writes ──────────────────────────────
ALTER TABLE IF EXISTS inquiries
  ADD COLUMN IF NOT EXISTS product     text,
  ADD COLUMN IF NOT EXISTS packaging   text,
  ADD COLUMN IF NOT EXISTS breed       text,
  ADD COLUMN IF NOT EXISTS quantity    text,
  ADD COLUMN IF NOT EXISTS timing      text,
  ADD COLUMN IF NOT EXISTS message     text,
  ADD COLUMN IF NOT EXISTS source      text,
  ADD COLUMN IF NOT EXISTS status      text NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS notes       text,
  ADD COLUMN IF NOT EXISTS flower_type text;

-- ─── 6. honey_products: pricing columns ──────────────────────────────────────
ALTER TABLE IF EXISTS honey_products
  ADD COLUMN IF NOT EXISTS price_plastic_uah integer,
  ADD COLUMN IF NOT EXISTS price_glass_uah   integer;

-- ─── 7. Domain constraints + nullable manual fields (guarded) ─────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='catalog_products') THEN
    ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_source_check;
    ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_source_check CHECK (source IN ('supplier','manual'));
    ALTER TABLE catalog_products DROP CONSTRAINT IF EXISTS catalog_products_lead_type_check;
    ALTER TABLE catalog_products ADD CONSTRAINT catalog_products_lead_type_check
      CHECK (lead_type IS NULL OR lead_type IN ('natural_products','metal'));
    ALTER TABLE catalog_products ALTER COLUMN price_uah    DROP NOT NULL;
    ALTER TABLE catalog_products ALTER COLUMN supplier_sku DROP NOT NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='catalog_categories') THEN
    ALTER TABLE catalog_categories DROP CONSTRAINT IF EXISTS catalog_categories_source_check;
    ALTER TABLE catalog_categories ADD CONSTRAINT catalog_categories_source_check CHECK (source IN ('supplier','manual'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_catalog_products_source     ON catalog_products(source);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_source   ON catalog_categories(source);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_sort     ON catalog_categories(source, sort_order);
CREATE INDEX IF NOT EXISTS idx_catalog_products_seo_status ON catalog_products(seo_status);

-- ─── 8. Category ordering: metal first, natural next, then supplier ───────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='catalog_categories') THEN
    UPDATE catalog_categories SET sort_order = 1 WHERE slug = 'metaloprofil-budmaterialy';
    UPDATE catalog_categories SET sort_order = 2 WHERE slug = 'naturalni-produkty';
    UPDATE catalog_categories SET sort_order = 3 WHERE slug = 'zhyvi-olii-holodnogo-vidzhymu';
  END IF;
END $$;

-- ─── 9. Honey pricing (UAH per liter), guarded ───────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='honey_products') THEN
    UPDATE honey_products SET price_plastic_uah = 400, price_glass_uah = 400;
    UPDATE honey_products SET price_plastic_uah = 600, price_glass_uah = 600 WHERE slug IN ('acacia-honey','linden-honey');
    UPDATE honey_products SET price_plastic_uah = 300, price_glass_uah = 300 WHERE slug = 'sunflower-honey';
  END IF;
END $$;

-- ─── 10. Set-based category-slug backfill (defensive) ────────────────────────
CREATE OR REPLACE FUNCTION public.backfill_category_slugs()
RETURNS TABLE(updated_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('catalog_products')) THEN
    updated_count := 0; RETURN NEXT; RETURN;
  END IF;
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

-- ─── 11. Diagnostics: reports missing REQUIRED tables, never throws ───────────
CREATE OR REPLACE FUNCTION public.pipeline_diagnostics()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_supplier_products boolean;
  missing_win bigint := 0;
BEGIN
  SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='supplier_products')
    INTO has_supplier_products;
  IF has_supplier_products THEN
    SELECT count(*) INTO missing_win FROM supplier_products WHERE price_win_field IS NULL AND raw_data IS NOT NULL;
  END IF;

  RETURN jsonb_build_object(
    'version', 54,
    'tables', (
      SELECT jsonb_object_agg(t, EXISTS(
        SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t
      ))
      FROM unnest(ARRAY['orders','order_items','catalog_products','catalog_categories',
                        'supplier_products','supplier_categories','inquiries','honey_products']) AS t
    ),
    'columns', (
      SELECT jsonb_object_agg(k, EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name=split_part(k,'.',1) AND column_name=split_part(k,'.',2)
      ))
      FROM unnest(ARRAY[
        'orders.supplier_order_id','orders.supplier_order_mode',
        'supplier_products.price_win_field','supplier_products.supplier_price_currency',
        'catalog_products.is_price_suspicious','catalog_categories.meta_auto_generated',
        'catalog_products.source','catalog_products.price_prefix','catalog_products.unit_label',
        'catalog_products.inquiry_only','catalog_products.lead_type','catalog_products.options',
        'catalog_categories.source','catalog_categories.lead_type','catalog_categories.sort_order',
        'catalog_products.seo_status','catalog_products.seo_manual_lock','catalog_products.description_ua',
        'catalog_categories.seo_status','catalog_categories.seo_manual_lock','catalog_categories.faq_json'
      ]) AS k
    ),
    'functions', jsonb_build_object(
      'backfill_category_slugs', EXISTS(SELECT 1 FROM pg_proc WHERE proname='backfill_category_slugs')
    ),
    'data', jsonb_build_object(
      'supplier_products_missing_win_field', missing_win
    )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.pipeline_diagnostics() TO service_role, authenticated, anon;

-- ─── 12. Temporary SEO fallback: description_ua ← meta_description ────────────
-- Set-based, never overwrites a manual lock or a non-empty description, only
-- touches published rows. Used by the admin "backfill fallback" button until AI
-- SEO is generated. Returns rows updated.
CREATE OR REPLACE FUNCTION public.backfill_seo_description_fallback()
RETURNS TABLE(updated_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='catalog_products' AND column_name='seo_status') THEN
    updated_count := 0; RETURN NEXT; RETURN;
  END IF;
  WITH upd AS (
    UPDATE catalog_products
    SET description_ua = meta_description,
        seo_status     = 'legacy',
        seo_source     = 'fallback',
        updated_at     = now()
    WHERE status = 'published'
      AND seo_manual_lock = false
      AND (description_ua IS NULL OR description_ua = '')
      AND meta_description IS NOT NULL AND meta_description <> ''
    RETURNING id
  )
  SELECT count(*) INTO v_updated FROM upd;
  updated_count := COALESCE(v_updated, 0);
  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.backfill_seo_description_fallback() TO service_role, authenticated, anon;
