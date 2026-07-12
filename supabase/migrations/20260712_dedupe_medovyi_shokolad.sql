-- Migration 20260712: de-duplicate the honey chocolate ("Шоколад на меду").
--
-- WHY THIS IS NEEDED
--   Chocolate currently exists TWICE, in two different tables:
--     • apiary_products.slug = 'medovyi-shokolad' — legacy row seeded by
--       migration 043_cleanup_and_products.sql at 200 грн.
--     • catalog_products (source='manual') slug = 'medovyi-shokolad' — the curated
--       natural product, now the single source of truth at 250 грн (defined in
--       lib/catalog/manual-catalog-data.ts, applied by the admin "seed manual
--       catalog" run).
--   Both surface on /products, so the same product appears twice at two prices.
--   getAllApiaryProducts() applies NO status filter, so archiving the apiary row
--   would not hide it — the legacy duplicate must be removed outright.
--
-- SCOPE / SAFETY
--   Removes ONLY the legacy apiary duplicate (and any of its product_media rows,
--   which have no FK — plain uuid). The canonical catalog_products chocolate is
--   left untouched. apiary_products holds catalog content, not orders, so no user
--   or order data is affected. Guarded + idempotent — safe to re-run.

DO $$
DECLARE
  choc_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'apiary_products'
  ) THEN
    RETURN;
  END IF;

  SELECT id INTO choc_id FROM apiary_products WHERE slug = 'medovyi-shokolad';
  IF choc_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'product_media'
    ) THEN
      DELETE FROM product_media WHERE product_section = 'apiary' AND product_id = choc_id;
    END IF;
    DELETE FROM apiary_products WHERE id = choc_id;
  END IF;
END $$;
