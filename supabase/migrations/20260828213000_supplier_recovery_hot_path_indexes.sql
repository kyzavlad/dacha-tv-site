-- ============================================================================
-- Migration: supplier recovery + storefront PDP hot-path indexes
-- ============================================================================
-- Production P0, 2026-08-28.
--
-- 1) Existing supplier -> catalog refresh selects the next bounded batch with:
--      is_approved = false AND name IS NOT NULL AND price_uah > 0
--      ORDER BY id LIMIT n
--
-- Production already has idx_supplier_products_actionable_queue, a partial
-- (id) index over only false/actionable rows. EXPLAIN still chose the primary
-- key, and pg_stat_user_indexes showed idx_scan=0 for that partial index. As the
-- early id range becomes approved, the PK plan has to filter an increasingly
-- large prefix before it finds the next batch.
--
-- Keep approval state as a REAL leading key instead of only an index predicate:
-- equality on is_approved=false jumps directly to the false key range and id is
-- already ordered inside that range. The partial predicate keeps rows with no
-- usable name/price out of this queue index while retaining both approval states,
-- so transitions false -> true do not recreate the pathological approved-prefix
-- scan.
--
-- 2) Product detail pages request related products with category_slug equality,
-- status='published', then order by is_featured DESC, display_order ASC.
-- Production PostgREST logs showed this exact request repeatedly returning
-- 500/504 under concurrent crawler pressure. Existing indexes cover published
-- global sort and category_slug equality separately, but not this equality +
-- sort access path. This partial composite index lets PostgreSQL narrow and
-- order one published category directly; the storefront-scope OR remains a
-- residual filter.
--
-- Additive only. No row/data mutation.
-- ============================================================================

create index if not exists idx_supplier_products_approval_id_queue
  on public.supplier_products (is_approved, id)
  where name is not null
    and price_uah > 0;

create index if not exists idx_cp_published_category_featured_sort
  on public.catalog_products (category_slug, is_featured desc, display_order asc)
  where status = 'published';
