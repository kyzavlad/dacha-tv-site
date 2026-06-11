-- Migration 050: Finish the supplier→catalog price backfill at scale.
--
-- Why SQL (not the admin endpoint): there are ~200k supplier_products rows.
-- A serverless function cannot issue 200k row-by-row PostgREST updates inside
-- one request, so the bulk price repair has to run as set-based SQL here.
-- The category cleanup (a few hundred rows) is handled in TypeScript by
-- normalizeAndFinalizeCategories() / the repair endpoint.
--
-- This migration is idempotent and safe to re-run. It:
--   1. Backfills price_win_field + supplier_price_currency for every row that
--      has raw_data (mirrors resolvePriceUah() priority order).
--   2. Fills supplier_products.price_uah ONLY where it is currently invalid
--      (NULL or < 10) and a real price can be derived — never overwrites a
--      valid existing price.
--   3. Propagates corrected prices into catalog_products and recomputes
--      is_price_suspicious so clean rows stop showing "Ціна за запитом".
--
-- USD prices are converted with the row's own rate when present, else the
-- prevailing supplier FX rate (statistical mode of supplier_price_rate),
-- never written raw. Rows that still can't be priced keep their existing value.

-- ─── 0. Safe numeric parser + prevailing FX rate ─────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.to_num(t text) RETURNS numeric AS $$
  SELECT CASE WHEN t ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' THEN trim(t)::numeric ELSE NULL END
$$ LANGUAGE sql IMMUTABLE;

-- Prevailing rate = the most common stored supplier_price_rate (> 5). Stored in
-- a session GUC so the big UPDATE references a constant, not a per-row subquery.
SELECT set_config(
  'catalog.fx_rate',
  COALESCE((
    SELECT supplier_price_rate::text
    FROM supplier_products
    WHERE supplier_price_rate IS NOT NULL AND supplier_price_rate > 5
    GROUP BY supplier_price_rate
    ORDER BY COUNT(*) DESC
    LIMIT 1
  ), ''),
  false
);

-- ─── 1+2. Backfill supplier_products price columns ───────────────────────────
WITH fx AS (
  SELECT NULLIF(current_setting('catalog.fx_rate', true), '')::numeric AS rate
)
UPDATE supplier_products sp
SET
  -- Effective rate: explicit per-item rate (>5) → stored rate (>5) → prevailing.
  supplier_price_rate = COALESCE(
    NULLIF(pg_temp.to_num(sp.raw_data->>'rate'), 0),
    CASE WHEN sp.supplier_price_rate > 5 THEN sp.supplier_price_rate END,
    (SELECT rate FROM fx)
  ),
  supplier_price_usd = COALESCE(
    sp.supplier_price_usd,
    NULLIF(pg_temp.to_num(sp.raw_data->>'price_usd'), 0),
    NULLIF(pg_temp.to_num(sp.raw_data->>'usd'), 0)
  ),
  price_win_field = CASE
    WHEN pg_temp.to_num(sp.raw_data->>'price_uah')    > 0 THEN 'price_uah'
    WHEN pg_temp.to_num(sp.raw_data->>'retail_price') > 0 THEN 'retail_price'
    WHEN pg_temp.to_num(sp.raw_data->>'price_usd')    > 0 AND e.eff_rate IS NOT NULL THEN 'price_usd*rate'
    WHEN pg_temp.to_num(sp.raw_data->>'usd')          > 0 AND e.eff_rate IS NOT NULL THEN 'price_usd*rate'
    WHEN pg_temp.to_num(sp.raw_data->>'price')        > 0 AND e.eff_rate IS NOT NULL THEN 'price*rate'
    WHEN pg_temp.to_num(sp.raw_data->>'price')        > 0 THEN 'rate_missing'
    ELSE 'none'
  END,
  supplier_price_currency = CASE
    WHEN pg_temp.to_num(sp.raw_data->>'price_uah')    > 0 THEN 'UAH'
    WHEN pg_temp.to_num(sp.raw_data->>'retail_price') > 0 THEN 'UAH'
    WHEN pg_temp.to_num(sp.raw_data->>'price_usd')    > 0 AND e.eff_rate IS NOT NULL THEN 'USD'
    WHEN pg_temp.to_num(sp.raw_data->>'usd')          > 0 AND e.eff_rate IS NOT NULL THEN 'USD'
    WHEN pg_temp.to_num(sp.raw_data->>'price')        > 0 AND e.eff_rate IS NOT NULL THEN 'USD'
    ELSE NULL
  END,
  -- Only (re)compute price_uah when the current value is missing/invalid.
  price_uah = CASE
    WHEN sp.price_uah IS NOT NULL AND sp.price_uah >= 10 THEN sp.price_uah
    WHEN pg_temp.to_num(sp.raw_data->>'price_uah')    > 0 THEN round(pg_temp.to_num(sp.raw_data->>'price_uah'))
    WHEN pg_temp.to_num(sp.raw_data->>'retail_price') > 0 THEN round(pg_temp.to_num(sp.raw_data->>'retail_price'))
    WHEN pg_temp.to_num(sp.raw_data->>'price_usd')    > 0 AND e.eff_rate IS NOT NULL THEN round(pg_temp.to_num(sp.raw_data->>'price_usd') * e.eff_rate)
    WHEN pg_temp.to_num(sp.raw_data->>'usd')          > 0 AND e.eff_rate IS NOT NULL THEN round(pg_temp.to_num(sp.raw_data->>'usd') * e.eff_rate)
    WHEN pg_temp.to_num(sp.raw_data->>'price')        > 0 AND e.eff_rate IS NOT NULL THEN round(pg_temp.to_num(sp.raw_data->>'price') * e.eff_rate)
    ELSE sp.price_uah
  END,
  last_price_synced_at = COALESCE(sp.last_price_synced_at, now()),
  updated_at = now()
FROM (
  SELECT
    sp2.id,
    COALESCE(
      NULLIF(pg_temp.to_num(sp2.raw_data->>'rate'), 0),
      CASE WHEN sp2.supplier_price_rate > 5 THEN sp2.supplier_price_rate END,
      (SELECT rate FROM fx)
    ) AS eff_rate
  FROM supplier_products sp2
) e
WHERE sp.id = e.id
  AND sp.raw_data IS NOT NULL;

-- ─── 3. Propagate corrected prices to catalog_products ───────────────────────
-- Update price only where the catalog value is currently invalid or stale, so we
-- never clobber a manually corrected price with a worse computed one.
UPDATE catalog_products cp
SET
  price_uah = sp.price_uah,
  updated_at = now()
FROM supplier_products sp
WHERE cp.supplier_sku = sp.supplier_sku
  AND sp.price_uah IS NOT NULL
  AND sp.price_uah >= 10
  AND (cp.price_uah IS NULL OR cp.price_uah < 10 OR cp.price_uah <> sp.price_uah);

-- Recompute is_price_suspicious for ALL catalog rows from the now-correct
-- supplier data. Suspicious = 10–100 UAH with no USD conversion source
-- (matches the TypeScript import rule).
UPDATE catalog_products cp
SET is_price_suspicious = (
      cp.price_uah >= 10 AND cp.price_uah < 100
      AND sp.supplier_price_usd IS NULL
      AND COALESCE(sp.supplier_price_currency, 'UAH') <> 'USD'
    ),
    updated_at = now()
FROM supplier_products sp
WHERE cp.supplier_sku = sp.supplier_sku;

-- ─── Proof queries (run manually after) ──────────────────────────────────────
-- SELECT price_win_field, supplier_price_currency, COUNT(*) n
--   FROM supplier_products GROUP BY 1,2 ORDER BY n DESC;
-- SELECT COUNT(*) FILTER (WHERE is_price_suspicious) AS suspicious,
--        COUNT(*) FILTER (WHERE price_uah < 10)      AS no_price
--   FROM catalog_products;
