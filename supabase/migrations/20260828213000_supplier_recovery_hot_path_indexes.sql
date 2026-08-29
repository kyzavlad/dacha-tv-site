-- ============================================================================
-- Migration: storefront PDP related-products hot-path index
-- ============================================================================
-- Production P0, 2026-08-28.
--
-- Product detail pages request related products with category_slug equality,
-- status='published', then order by is_featured DESC, display_order ASC.
-- Production PostgREST logs showed this exact request repeatedly returning
-- 500/504 under concurrent crawler pressure. Existing indexes cover published
-- global sort and category_slug equality separately, but not this equality +
-- sort access path. This partial composite index lets PostgreSQL narrow and
-- order one published category directly; the storefront-scope OR remains a
-- residual filter.
--
-- Live EXPLAIN verified this exact index becomes the chosen access path with
-- category_slug as Index Cond. Supplier-refresh queue indexing is intentionally
-- handled by the later schema-aligned migration after live planner verification.
--
-- Additive only. No row/data mutation.
-- ============================================================================

create index if not exists idx_cp_published_category_featured_sort
  on public.catalog_products (category_slug, is_featured desc, display_order asc)
  where status = 'published';
