-- ============================================================================
-- Migration: 20260721230000_final_full_i18n_media_stock_v5
-- ============================================================================
-- CONSOLIDATED, additive, idempotent. Supersedes the never-deployed v4 draft
-- (20260720230000). No data rewrite. Safe to re-run. Covers:
--   • Public stock: catalog_products.stock_quantity / is_in_stock / stock_synced_at
--   • Image metadata: catalog_products.main_image_alt / image_metadata
--   • Localized product fields: catalog_product_translations.name /
--     short_description / seo_description; catalog_products.seo_description
--   • Media: idempotent public `product-media` Storage bucket + policies
--   • NEW (v5): manual_content_translations — RU/EN for honey/apiary/beekeeper/
--     flower/service/static manual sections (backward compatible; the base rows
--     keep their Ukrainian columns untouched).
--
-- Every statement guards its own existence, so re-running is a no-op. DDL is
-- self-contained and safe to apply in any order relative to the other 20260720*
-- migrations.
-- ============================================================================

-- ── Public storefront stock ─────────────────────────────────────────────────
alter table catalog_products add column if not exists stock_quantity  integer;
alter table catalog_products add column if not exists is_in_stock      boolean;
alter table catalog_products add column if not exists stock_synced_at  timestamptz;

comment on column catalog_products.stock_quantity is
  'Public storefront stock, synced from supplier_products by the import. NULL until first sync. Manual/metal rows are left NULL (availability is "ask").';
comment on column catalog_products.is_in_stock is
  'Public availability flag, synced from supplier_products. NULL = unknown/unsynced. FALSE on a synced supplier row blocks add-to-cart and checkout.';
comment on column catalog_products.stock_synced_at is
  'Timestamp of the last stock sync for this row. NULL = never synced (status shown as "Уточнити наявність").';

create index if not exists idx_catalog_products_in_stock
  on catalog_products(is_in_stock)
  where is_in_stock is not null;

-- ── Localized name / short_description + long SEO description ─────────────────
alter table catalog_product_translations add column if not exists name              text;
alter table catalog_product_translations add column if not exists short_description text;
alter table catalog_product_translations add column if not exists seo_description   text;

comment on column catalog_product_translations.name is
  'Localized display name for this locale. Falls back to catalog_products.name_ua when absent.';
comment on column catalog_product_translations.short_description is
  'Localized short (card) description. Falls back to the Ukrainian short_description when absent.';
comment on column catalog_product_translations.seo_description is
  'Longer localized SEO body copy, distinct from the storefront short_description.';

alter table catalog_products add column if not exists seo_description text;
comment on column catalog_products.seo_description is
  'Ukrainian long-form SEO description (distinct from the storefront short_description). RU/EN live in catalog_product_translations.seo_description.';

-- ── Image metadata ──────────────────────────────────────────────────────────
alter table catalog_products add column if not exists main_image_alt text;
alter table catalog_products add column if not exists image_metadata jsonb;

comment on column catalog_products.main_image_alt is
  'Alt text for the primary image. Falls back to the localized product name on the storefront when empty.';
comment on column catalog_products.image_metadata is
  'Ordered image list [{url, alt, position, isPrimary}]. Backward-compatible companion to main_image_url + images (those stay authoritative).';

-- ── product-media Storage bucket (public read, service-role write) ───────────
insert into storage.buckets (id, name, public)
values ('product-media', 'product-media', true)
on conflict (id) do update set public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'product_media_public_read'
  ) THEN
    CREATE POLICY "product_media_public_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'product-media');
  END IF;

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

-- ── v5: manual-section RU/EN translations ────────────────────────────────────
-- One generic table for the hand-managed Dacha TV sections. entity_type is
-- constrained so a row can only reference a known manual table; entity_id is the
-- source record's uuid or slug (text, to accommodate both). The base rows keep
-- their Ukrainian columns — this is purely additive RU/EN enrichment. A missing
-- row means the storefront falls back to Ukrainian (intentional).
create table if not exists manual_content_translations (
  id                uuid        primary key default gen_random_uuid(),
  entity_type       text        not null
                    check (entity_type in ('honey_product','apiary_product','beekeeper_product','flower_product','service','static')),
  entity_id         text        not null,
  locale            text        not null check (locale in ('ru','en')),
  name              text,
  short_description text,
  description       text,
  seo_title         text,
  seo_description   text,
  seo_keywords      text,
  image_alt         text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (entity_type, entity_id, locale)
);

create index if not exists idx_manual_translations_lookup
  on manual_content_translations(entity_type, entity_id, locale);
create index if not exists idx_manual_translations_locale
  on manual_content_translations(locale);

-- Reuse the shared updated_at trigger fn (defined in the base rebuild migration).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_manual_translations_updated_at') THEN
    CREATE TRIGGER set_manual_translations_updated_at
      BEFORE UPDATE ON manual_content_translations
      FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
  END IF;
END $$;

-- RLS: public (anon) read so the storefront can render localized content; all
-- writes stay service-role (mirrors catalog_product_translations).
alter table manual_content_translations enable row level security;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='manual_content_translations' AND policyname='service_role_all_manual_translations') THEN
    CREATE POLICY "service_role_all_manual_translations" ON manual_content_translations
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='manual_content_translations' AND policyname='public_read_manual_translations') THEN
    CREATE POLICY "public_read_manual_translations" ON manual_content_translations
      FOR SELECT USING (true);
  END IF;
END $$;
