-- ============================================================================
-- Migration: supplier recovery + storefront hot-path indexes
-- ============================================================================
-- Production P0, 2026-08-28.
--
-- 1) Existing supplier -> catalog refresh repeatedly selects the next bounded
--    batch from supplier_products with:
--      is_approved = false AND name IS NOT NULL AND price_uah > 0
--      ORDER BY id LIMIT n
--    After most early ids become approved, a plain PK/id scan must walk an
--    increasingly large approved prefix before finding the next candidates.
--    This partial index keeps only actionable queue rows in id order.
--
-- 2) Product detail pages request related products with category_slug equality,
--    status='published', then order by is_featured DESC, display_order ASC.
--    Production PostgREST logs showed this exact request repeatedly returning
--    500/504 under crawl pressure. Existing indexes cover published global sort
--    and category_slug trigram search separately, but not this equality + sort
--    access path. This partial composite index lets PostgreSQL narrow and order
--    a category directly; the storefront-scope OR remains a residual filter.
--
-- Additive only. No row/data mutation. Apply only after checking live indexes,
-- because production has newer index-deduplication migrations than the repo.
-- ============================================================================

create index if not exists idx_supplier_products_pending_refresh_id
  on public.supplier_products (id)
  where is_approved = false
    and name is not null
    and price_uah > 0;

create index if not exists idx_cp_published_category_featured_sort
  on public.catalog_products (category_slug, is_featured desc, display_order asc)
  where status = 'published';
