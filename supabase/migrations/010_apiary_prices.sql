-- ─── Migration 010: Apiary product placeholder prices ─────────────────────────
-- Sets price_uah on existing apiary products.
-- Uses COALESCE to preserve any manually-set prices already in the DB.

UPDATE apiary_products SET price_uah = COALESCE(price_uah, 200)
  WHERE slug = 'swarm-lure';

UPDATE apiary_products SET price_uah = COALESCE(price_uah, 180)
  WHERE slug = 'kvitkovyi-pylok';

UPDATE apiary_products SET price_uah = COALESCE(price_uah, 120)
  WHERE slug = 'propolis';

UPDATE apiary_products SET price_uah = COALESCE(price_uah, 230)
  WHERE slug = 'horixy-v-medu';

-- Also handle any old Frey slug that may not have been renamed yet
UPDATE apiary_products SET price_uah = COALESCE(price_uah, 200)
  WHERE slug IN ('frey-swarm-lure', 'primanka-dlya-royiv') AND price_uah IS NULL;
