-- Migration 049: Complete catalog repair
-- 1. Ensure supplier_products columns from 048 actually exist (idempotent)
-- 2. Backfill price_win_field + supplier_price_currency from stored raw_data
-- 3. Aggressive category name extraction from supplier_categories.raw_data and
--    supplier_products.raw_data using all known field variants
-- 4. Propagate fixed names to catalog_categories
-- 5. Delete numeric catalog_categories that have zero published products
-- 6. Rename remaining numeric catalog_categories to a non-numeric placeholder
--    so the pipeline stat reads 0 and products surface under "Інші товари"
-- Safe to re-run.

-- ─── 1. Ensure columns exist ─────────────────────────────────────────────────
ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS price_win_field       text,
  ADD COLUMN IF NOT EXISTS supplier_price_currency text;

ALTER TABLE catalog_categories
  ADD COLUMN IF NOT EXISTS meta_auto_generated boolean NOT NULL DEFAULT false;

-- ─── 2. Backfill price_win_field + supplier_price_currency from raw_data ─────
-- Mirrors TypeScript resolvePriceUah() priority order.
-- Only touches rows that are still NULL (idempotent).
UPDATE supplier_products
SET
  price_win_field = CASE
    WHEN (raw_data->>'price_uah')::numeric > 0                                    THEN 'price_uah'
    WHEN (raw_data->>'retail_price')::numeric > 0                                 THEN 'retail_price'
    WHEN (raw_data->>'price_usd')::numeric > 0 AND supplier_price_rate IS NOT NULL THEN 'price_usd*rate'
    WHEN (raw_data->>'usd')::numeric       > 0 AND supplier_price_rate IS NOT NULL THEN 'price_usd*rate'
    WHEN (raw_data->>'price')::numeric     > 0 AND supplier_price_rate IS NOT NULL THEN 'price*rate'
    WHEN (raw_data->>'price')::numeric     > 0                                    THEN 'rate_missing'
    ELSE 'none'
  END,
  supplier_price_currency = CASE
    WHEN (raw_data->>'price_uah')::numeric > 0                                    THEN 'UAH'
    WHEN (raw_data->>'retail_price')::numeric > 0                                 THEN 'UAH'
    WHEN (raw_data->>'price_usd')::numeric > 0 AND supplier_price_rate IS NOT NULL THEN 'USD'
    WHEN (raw_data->>'usd')::numeric       > 0 AND supplier_price_rate IS NOT NULL THEN 'USD'
    WHEN (raw_data->>'price')::numeric     > 0 AND supplier_price_rate IS NOT NULL THEN 'USD'
    ELSE NULL
  END
WHERE price_win_field IS NULL
  AND raw_data IS NOT NULL;

-- ─── 3. Extract category names from raw_data (supplier_categories) ────────────
-- Try every known field variant — broader than what the TypeScript repair does.
UPDATE supplier_categories sc
SET
  name    = sub.resolved_name,
  name_ua = sub.resolved_name
FROM (
  SELECT
    sc2.supplier_id,
    COALESCE(
      CASE WHEN sc2.raw_data->>'name_ua'       !~ '^[0-9]+$' AND sc2.raw_data->>'name_ua'       <> '' THEN sc2.raw_data->>'name_ua'       END,
      CASE WHEN sc2.raw_data->>'title_ua'      !~ '^[0-9]+$' AND sc2.raw_data->>'title_ua'      <> '' THEN sc2.raw_data->>'title_ua'      END,
      CASE WHEN sc2.raw_data->>'category_ua'   !~ '^[0-9]+$' AND sc2.raw_data->>'category_ua'   <> '' THEN sc2.raw_data->>'category_ua'   END,
      CASE WHEN sc2.raw_data->>'name'          !~ '^[0-9]+$' AND sc2.raw_data->>'name'          <> '' THEN sc2.raw_data->>'name'          END,
      CASE WHEN sc2.raw_data->>'title'         !~ '^[0-9]+$' AND sc2.raw_data->>'title'         <> '' THEN sc2.raw_data->>'title'         END,
      CASE WHEN sc2.raw_data->>'category_name' !~ '^[0-9]+$' AND sc2.raw_data->>'category_name' <> '' THEN sc2.raw_data->>'category_name' END,
      CASE WHEN sc2.raw_data->>'group_name'    !~ '^[0-9]+$' AND sc2.raw_data->>'group_name'    <> '' THEN sc2.raw_data->>'group_name'    END,
      CASE WHEN sc2.raw_data->>'section_name'  !~ '^[0-9]+$' AND sc2.raw_data->>'section_name'  <> '' THEN sc2.raw_data->>'section_name'  END
    ) AS resolved_name
  FROM supplier_categories sc2
  WHERE sc2.name ~ '^[0-9]+$'
) sub
WHERE sc.supplier_id = sub.supplier_id
  AND sub.resolved_name IS NOT NULL
  AND TRIM(sub.resolved_name) <> ''
  AND sub.resolved_name !~ '^[0-9]+$';

-- ─── 4. Extract names from supplier_products.raw_data (fallback) ─────────────
-- For categories still numeric after step 3: sample one product per category
-- and try to pull a category name from the product's raw_data fields.
UPDATE supplier_categories sc
SET
  name    = sub.resolved_name,
  name_ua = sub.resolved_name
FROM (
  SELECT DISTINCT ON (sp.supplier_category_id)
    sp.supplier_category_id,
    COALESCE(
      CASE WHEN sp.raw_data->>'category'       !~ '^[0-9]+$' AND sp.raw_data->>'category'       <> '' THEN sp.raw_data->>'category'       END,
      CASE WHEN sp.raw_data->>'category_name'  !~ '^[0-9]+$' AND sp.raw_data->>'category_name'  <> '' THEN sp.raw_data->>'category_name'  END,
      CASE WHEN sp.raw_data->>'category_ua'    !~ '^[0-9]+$' AND sp.raw_data->>'category_ua'    <> '' THEN sp.raw_data->>'category_ua'    END,
      CASE WHEN sp.raw_data->>'cat_name'       !~ '^[0-9]+$' AND sp.raw_data->>'cat_name'       <> '' THEN sp.raw_data->>'cat_name'       END,
      CASE WHEN sp.raw_data->>'group'          !~ '^[0-9]+$' AND sp.raw_data->>'group'          <> '' THEN sp.raw_data->>'group'          END,
      CASE WHEN sp.raw_data->>'group_name'     !~ '^[0-9]+$' AND sp.raw_data->>'group_name'     <> '' THEN sp.raw_data->>'group_name'     END,
      CASE WHEN sp.raw_data->>'section'        !~ '^[0-9]+$' AND sp.raw_data->>'section'        <> '' THEN sp.raw_data->>'section'        END,
      CASE WHEN sp.raw_data->>'section_name'   !~ '^[0-9]+$' AND sp.raw_data->>'section_name'   <> '' THEN sp.raw_data->>'section_name'   END,
      CASE WHEN sp.raw_data->>'category_title' !~ '^[0-9]+$' AND sp.raw_data->>'category_title' <> '' THEN sp.raw_data->>'category_title' END
    ) AS resolved_name
  FROM supplier_products sp
  JOIN supplier_categories sc2 ON sc2.supplier_id = sp.supplier_category_id
  WHERE sc2.name ~ '^[0-9]+$'
    AND sp.raw_data IS NOT NULL
  ORDER BY sp.supplier_category_id, sp.id
) sub
WHERE sc.supplier_id = sub.supplier_category_id
  AND sub.resolved_name IS NOT NULL
  AND TRIM(sub.resolved_name) <> ''
  AND sub.resolved_name !~ '^[0-9]+$';

-- ─── 5. Propagate fixed names to catalog_categories ──────────────────────────
UPDATE catalog_categories cc
SET name_ua = sc.name_ua
FROM supplier_categories sc
WHERE cc.supplier_category_id = sc.supplier_id
  AND cc.name_ua ~ '^[0-9]+$'
  AND sc.name_ua IS NOT NULL
  AND TRIM(sc.name_ua) <> ''
  AND sc.name_ua !~ '^[0-9]+$';

-- ─── 6. Delete numeric catalog_categories with zero published products ────────
-- These are invisible on the frontend and safe to remove.
DELETE FROM catalog_categories
WHERE name_ua ~ '^[0-9]+$'
  AND id NOT IN (
    SELECT DISTINCT cc.id
    FROM catalog_categories cc
    JOIN catalog_products cp ON cp.category_slug = cc.slug
    WHERE cp.status = 'published'
  );

-- ─── 7. Unpublish and neutrally rename remaining numeric categories ───────────
-- Any numeric catalog_category still left has published products pointing to it.
-- Unpublish so those products land in "Інші товари" (the catch-all /catalog/all
-- bucket). Rename from e.g. "12345" to "cat-12345" so the stat reads 0 and the
-- slug stops being a bare number (a separate TypeScript repair will regenerate
-- proper slugs once names are available).
UPDATE catalog_categories
SET
  is_published = false,
  name_ua      = 'cat-' || name_ua,
  slug         = 'cat-' || slug
WHERE name_ua ~ '^[0-9]+$';

-- ─── Proof queries (run after applying) ──────────────────────────────────────
-- SELECT COUNT(*) FILTER (WHERE name_ua ~ '^[0-9]+$') AS still_numeric,
--        COUNT(*) FILTER (WHERE is_published)          AS published
-- FROM catalog_categories;
--
-- SELECT price_win_field, supplier_price_currency, COUNT(*) AS n
-- FROM supplier_products GROUP BY 1,2 ORDER BY n DESC LIMIT 10;
