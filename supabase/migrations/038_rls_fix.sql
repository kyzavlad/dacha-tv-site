-- Migration 038: RLS policies for services + dropshipping tables
-- Root cause of empty public /services page: the services table was created in
-- migration 035 without RLS policies. All storefront tables follow the pattern:
--   ENABLE ROW LEVEL SECURITY + public SELECT policy + service_role ALL policy.
--
-- Idempotent + valid syntax: PostgreSQL has no `CREATE POLICY IF NOT EXISTS`, so
-- every policy is created inside a DO block guarded by both table existence and
-- pg_policies existence. Safe to re-run and safe when a table is absent.

DO $$
BEGIN
  -- services
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='services') THEN
    ALTER TABLE services ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='services' AND policyname='public_read_services') THEN
      CREATE POLICY "public_read_services" ON services FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='services' AND policyname='service_role_all_services') THEN
      CREATE POLICY "service_role_all_services" ON services FOR ALL USING (auth.role() = 'service_role');
    END IF;
  END IF;

  -- product_media
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='product_media') THEN
    ALTER TABLE product_media ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_media' AND policyname='public_read_product_media') THEN
      CREATE POLICY "public_read_product_media" ON product_media FOR SELECT USING (true);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='product_media' AND policyname='service_role_all_product_media') THEN
      CREATE POLICY "service_role_all_product_media" ON product_media FOR ALL USING (auth.role() = 'service_role');
    END IF;
  END IF;

  -- supplier_categories (requires migration 037)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='supplier_categories') THEN
    ALTER TABLE supplier_categories ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_categories' AND policyname='service_role_all_supplier_categories') THEN
      CREATE POLICY "service_role_all_supplier_categories" ON supplier_categories FOR ALL USING (auth.role() = 'service_role');
    END IF;
  END IF;

  -- supplier_products (requires migration 037)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='supplier_products') THEN
    ALTER TABLE supplier_products ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_products' AND policyname='service_role_all_supplier_products') THEN
      CREATE POLICY "service_role_all_supplier_products" ON supplier_products FOR ALL USING (auth.role() = 'service_role');
    END IF;
  END IF;

  -- catalog_products (requires migration 037) — public reads published rows only
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='catalog_products') THEN
    ALTER TABLE catalog_products ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='catalog_products' AND policyname='public_read_published_catalog_products') THEN
      CREATE POLICY "public_read_published_catalog_products" ON catalog_products FOR SELECT USING (status = 'published');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='catalog_products' AND policyname='service_role_all_catalog_products') THEN
      CREATE POLICY "service_role_all_catalog_products" ON catalog_products FOR ALL USING (auth.role() = 'service_role');
    END IF;
  END IF;

  -- supplier_sync_log (requires migration 037)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='supplier_sync_log') THEN
    ALTER TABLE supplier_sync_log ENABLE ROW LEVEL SECURITY;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_sync_log' AND policyname='service_role_all_supplier_sync_log') THEN
      CREATE POLICY "service_role_all_supplier_sync_log" ON supplier_sync_log FOR ALL USING (auth.role() = 'service_role');
    END IF;
  END IF;
END $$;
