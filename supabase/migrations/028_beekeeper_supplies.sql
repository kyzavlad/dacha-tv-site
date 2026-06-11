-- Migration 028: Move swarm-lure from apiary to beekeeper, add wax-foundation
-- Idempotent — safe to run multiple times

BEGIN;

-- 1. Insert swarm-lure into beekeeper_products (apiary_supply type)
INSERT INTO beekeeper_products (slug, name, product_type, description, season_note, display_order, status, is_featured, image_url, image_alt)
VALUES (
  'swarm-lure',
  'Приманка для роїв',
  'apiary_supply',
  'Приманка для роїв використовується в сезон роїння для підвищення шансів заселення пастки або підготовленого вулика. Зручний формат банки дозволяє легко використовувати продукт у практичній роботі на пасіці.',
  'Сезон роїння: квітень–липень',
  4,
  'available',
  true,
  '/images/dacha-tv/products/swarm-lure-01.jpg',
  'Приманка для роїв Dacha TV'
)
ON CONFLICT (slug) DO NOTHING;

-- 2. Migrate product_media rows from apiary swarm-lure to beekeeper swarm-lure
-- (only if apiary row exists with that slug)
DO $$
DECLARE
  apiary_id  uuid;
  bk_id      uuid;
BEGIN
  SELECT id INTO apiary_id  FROM apiary_products    WHERE slug = 'swarm-lure' LIMIT 1;
  SELECT id INTO bk_id      FROM beekeeper_products WHERE slug = 'swarm-lure' LIMIT 1;

  IF apiary_id IS NOT NULL AND bk_id IS NOT NULL THEN
    UPDATE product_media
    SET product_section = 'beekeeper', product_id = bk_id::text
    WHERE product_section = 'apiary' AND product_id = apiary_id::text;
  END IF;
END $$;

-- 3. Delete swarm-lure from apiary_products
DELETE FROM apiary_products WHERE slug = 'swarm-lure';

-- 4. Insert Вощина Dacha TV into beekeeper_products
INSERT INTO beekeeper_products (slug, name, product_type, description, display_order, status, is_featured, image_alt)
VALUES (
  'wax-foundation',
  'Вощина Dacha TV',
  'apiary_supply',
  'Натуральна бджолиновощина з якісного бджолиного воску. Підходить для стандартних рамок Дадан та інших типів вуликів.',
  5,
  'available',
  false,
  'Вощина Dacha TV'
)
ON CONFLICT (slug) DO NOTHING;

-- 5. Enforce canonical apiary count — keep only the 3 canonical slugs
DELETE FROM apiary_products
WHERE slug NOT IN ('flower-pollen', 'propolis', 'nuts-in-honey');

-- 6. Enforce canonical beekeeper count — keep only the 5 canonical slugs
DELETE FROM beekeeper_products
WHERE slug NOT IN ('bee-packages', 'bee-colonies', 'empty-hives', 'swarm-lure', 'wax-foundation');

COMMIT;
