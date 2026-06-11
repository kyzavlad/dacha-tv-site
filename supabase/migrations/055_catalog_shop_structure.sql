-- Migration 055: Shop structure — /catalog = supplier + one pinned metal category;
-- natural/food products leave /catalog and live under /products.
--
-- Fully defensive: ALTER TABLE IF EXISTS, table-existence guards, no
-- CREATE POLICY IF NOT EXISTS. Idempotent — safe to re-run on the live DB.

-- ─── 1. Ensure shop-structure columns exist (re-assert from 054) ──────────────
ALTER TABLE IF EXISTS catalog_products
  ADD COLUMN IF NOT EXISTS sort_order    integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS product_group text    NOT NULL DEFAULT 'catalog';
ALTER TABLE IF EXISTS catalog_categories
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='catalog_categories') THEN
    RETURN;
  END IF;

  -- ── 2. Rename the manual metal category (guarded so re-runs / partial states
  --       never create a duplicate slug). New canonical slug + name. ──────────
  IF EXISTS (SELECT 1 FROM catalog_categories WHERE slug='metaloprofil-budmaterialy')
     AND NOT EXISTS (SELECT 1 FROM catalog_categories WHERE slug='metaloprofil-pokrivlia-komplektuiuchi') THEN
    UPDATE catalog_categories
       SET slug='metaloprofil-pokrivlia-komplektuiuchi',
           name_ua='Металопрофіль, покрівля та комплектуючі'
     WHERE slug='metaloprofil-budmaterialy';
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='catalog_products') THEN
      UPDATE catalog_products
         SET category_slug='metaloprofil-pokrivlia-komplektuiuchi'
       WHERE category_slug='metaloprofil-budmaterialy';
    END IF;
  END IF;

  -- ── 3. Pin the metal category first; keep it published + manual. ───────────
  UPDATE catalog_categories
     SET sort_order=1, is_published=true, source='manual'
   WHERE slug='metaloprofil-pokrivlia-komplektuiuchi';

  -- If a re-seed recreated the OLD metal slug before this migration ran, retire
  -- it so /catalog never shows a duplicate empty metal category.
  UPDATE catalog_categories SET is_published=false WHERE slug='metaloprofil-budmaterialy';

  -- ── 4. Remove natural/food manual categories from /catalog (unpublish). Their
  --       products stay published and are shown under /products instead. ──────
  UPDATE catalog_categories
     SET is_published=false
   WHERE slug IN ('naturalni-produkty','zhyvi-olii-holodnogo-vidzhymu');
  UPDATE catalog_categories SET sort_order=2 WHERE slug='naturalni-produkty';
  UPDATE catalog_categories SET sort_order=3 WHERE slug='zhyvi-olii-holodnogo-vidzhymu';
END $$;

-- ─── 5. Classify products into groups (metal / natural / catalog) ────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='catalog_products') THEN
    RETURN;
  END IF;
  UPDATE catalog_products SET product_group='metal'
    WHERE lead_type='metal' OR category_slug='metaloprofil-pokrivlia-komplektuiuchi';
  UPDATE catalog_products SET product_group='natural'
    WHERE lead_type='natural_products'
       OR category_slug IN ('naturalni-produkty','zhyvi-olii-holodnogo-vidzhymu');
  -- Everything else (supplier API products) stays 'catalog' (column default).
  UPDATE catalog_products SET product_group='catalog'
    WHERE product_group IS NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_catalog_products_group ON catalog_products(product_group);
