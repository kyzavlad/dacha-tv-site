-- ============================================================================
-- Migration: 20260720_final_catalog_i18n_stock_media_v4
-- ============================================================================
-- Additive, idempotent. No data rewrite. Safe to re-run. Covers three defect
-- areas of the "final catalog / i18n / stock / media" pass:
--
--   • Item 6 — Public stock synchronization.
--       catalog_products gains stock_quantity / is_in_stock / stock_synced_at.
--       The supplier import (`syncProductsToCatalog`) copies supplier stock onto
--       these columns for supplier rows ONLY (source <> 'manual'); manual + metal
--       rows are never given supplier stock. The storefront reads availability
--       from here without touching the supplier layer at request time.
--
--   • Item 2 — Image metadata.
--       catalog_products gains main_image_alt (alt text for the primary image)
--       and image_metadata jsonb (ordered [{url, alt, position, isPrimary}]).
--       main_image_url + images stay authoritative for backward compatibility.
--
--   • Item 1 — Media uploads.
--       Idempotent public `product-media` Storage bucket + service-role write /
--       public read policies, so admin server uploads have a stable destination.
--
-- ORDER: apply AFTER 20260720_catalog_manual_ownership_and_sync_state.sql (which
-- adds the manual-lock columns this pass relies on) and the v3 metal/language
-- migration. Every statement guards its own existence, so re-running is a no-op.
-- ============================================================================

-- ── Item 6: public storefront stock ─────────────────────────────────────────
alter table catalog_products add column if not exists stock_quantity  integer;
alter table catalog_products add column if not exists is_in_stock      boolean;
alter table catalog_products add column if not exists stock_synced_at  timestamptz;

comment on column catalog_products.stock_quantity is
  'Public storefront stock, synced from supplier_products by the import. NULL until first sync. Manual/metal rows are left NULL (availability is "ask").';
comment on column catalog_products.is_in_stock is
  'Public availability flag, synced from supplier_products. NULL = unknown/unsynced. FALSE on a synced supplier row blocks add-to-cart and checkout.';
comment on column catalog_products.stock_synced_at is
  'Timestamp of the last stock sync for this row. NULL = never synced (status shown as "Уточнити наявність").';

-- Partial index: the storefront frequently filters supplier rows by availability.
create index if not exists idx_catalog_products_in_stock
  on catalog_products(is_in_stock)
  where is_in_stock is not null;

-- ── Item 2: image metadata ──────────────────────────────────────────────────
alter table catalog_products add column if not exists main_image_alt text;
alter table catalog_products add column if not exists image_metadata jsonb;

comment on column catalog_products.main_image_alt is
  'Alt text for the primary image. Falls back to the localized product name on the storefront when empty.';
comment on column catalog_products.image_metadata is
  'Ordered image list [{url, alt, position, isPrimary}]. Backward-compatible companion to main_image_url + images (those stay authoritative).';

-- ── Item 1: product-media Storage bucket (public read, service-role write) ───
-- Bucket is created idempotently and forced public. Uploads happen server-side
-- with the service-role key (admin only); the public read policy lets the
-- rendered <img> URLs resolve without auth.
insert into storage.buckets (id, name, public)
values ('product-media', 'product-media', true)
on conflict (id) do update set public = true;

DO $$
BEGIN
  -- Public read of product-media objects.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'product_media_public_read'
  ) THEN
    CREATE POLICY "product_media_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'product-media');
  END IF;

  -- Service-role full control (insert/update/delete) of product-media objects.
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'product_media_service_role_write'
  ) THEN
    CREATE POLICY "product_media_service_role_write" ON storage.objects
      FOR ALL USING (bucket_id = 'product-media' AND auth.role() = 'service_role')
      WITH CHECK (bucket_id = 'product-media' AND auth.role() = 'service_role');
  END IF;
END $$;
