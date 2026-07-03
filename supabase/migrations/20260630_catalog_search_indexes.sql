-- ============================================================================
-- Migration: 20260630_catalog_search_indexes
-- ============================================================================
-- Makes storefront search over the ~105k-row catalog_products table FAST and
-- DB-safe. Before this, `ilike '%term%'` on name_ua / name / supplier_sku could
-- not use any index (leading wildcard), so every search sequentially scanned all
-- published rows. pg_trgm GIN indexes let those ilike queries use an index and
-- return in single-digit ms — this is what unblocks live search + autocomplete.
--
-- Also adds a composite index matching the default catalog sort so /catalog/all
-- and category listings don't full-sort the published set on every request.
--
-- Additive and idempotent. No data changes. Safe to re-run.
--
-- NOTE: these use plain CREATE INDEX (brief write-lock during build; the catalog
-- is only written by the nightly cron, so run during a quiet window). For a
-- zero-downtime build on a busy table, run each CREATE INDEX with CONCURRENTLY
-- instead, one statement at a time OUTSIDE a transaction block.
-- ============================================================================

create extension if not exists pg_trgm;

-- Trigram GIN indexes for substring/typo-tolerant ilike search.
create index if not exists idx_cp_name_ua_trgm
  on catalog_products using gin (name_ua gin_trgm_ops);

create index if not exists idx_cp_name_trgm
  on catalog_products using gin (name gin_trgm_ops);

create index if not exists idx_cp_supplier_sku_trgm
  on catalog_products using gin (supplier_sku gin_trgm_ops);

-- Composite index matching the default "featured" sort on the published set, so
-- /catalog/all and search result ordering can use it instead of a full sort.
create index if not exists idx_cp_published_featured_sort
  on catalog_products (is_featured desc, display_order, name_ua)
  where status = 'published';

-- Helps the sitemap's ordered keyset pagination over published products.
create index if not exists idx_cp_published_id
  on catalog_products (id)
  where status = 'published';
