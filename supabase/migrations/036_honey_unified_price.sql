-- Migration 036: Unified honey pricing + all products featured
-- Sets all honey products to 500 UAH regardless of packaging.
-- Marks all varieties as is_featured so they all show on the homepage.
-- Idempotent — safe to re-run.

UPDATE honey_products
SET
  price_plastic_uah = 500,
  price_glass_uah   = 500,
  is_featured       = true
WHERE price_plastic_uah IS NOT NULL
   OR price_glass_uah   IS NOT NULL
   OR is_featured = false;
