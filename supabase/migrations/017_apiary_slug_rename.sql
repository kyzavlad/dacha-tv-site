-- Migration 017: Rename apiary product slugs to English for consistency
-- Idempotent: uses NOT EXISTS guards so it is safe to run multiple times

-- kvitkovyi-pylok → flower-pollen
UPDATE apiary_products
  SET slug = 'flower-pollen'
  WHERE slug = 'kvitkovyi-pylok'
    AND NOT EXISTS (SELECT 1 FROM apiary_products WHERE slug = 'flower-pollen');

-- horikhy-v-medu → nuts-in-honey
UPDATE apiary_products
  SET slug = 'nuts-in-honey'
  WHERE slug IN ('horikhy-v-medu', 'horixy-v-medu')
    AND NOT EXISTS (SELECT 1 FROM apiary_products WHERE slug = 'nuts-in-honey');

-- frey-swarm-lure → swarm-lure (in case migration 009 was not applied)
UPDATE apiary_products
  SET slug = 'swarm-lure'
  WHERE slug IN ('frey-swarm-lure', 'primanka-dlya-royiv')
    AND NOT EXISTS (SELECT 1 FROM apiary_products WHERE slug = 'swarm-lure');

-- Ensure swarm-lure exists (insert if completely absent)
INSERT INTO apiary_products (
  name, slug,
  short_description, description, full_description,
  usage_notes, storage_info, packaging_note,
  packaging, weight_g,
  price_uah, image_url, image_alt,
  is_featured, in_stock, display_order
) VALUES (
  'Приманка для роїв',
  'swarm-lure',
  'Готова приманка для приваблення бджолиних роїв у компактній зручній банці.',
  'Приманка для роїв використовується в сезон роїння для підвищення шансів заселення пастки або підготовленого вулика.',
  'Приманка для роїв використовується в сезон роїння для підвищення шансів заселення пастки або підготовленого вулика. Зручний формат банки дозволяє легко використовувати продукт у практичній роботі на пасіці.',
  'Нанесіть невелику кількість на внутрішні стінки вулика-пастки за 1–2 дні до очікуваного роїння. Також обробіть льоток. Повторіть через тиждень за потреби.',
  'Зберігати в прохолодному темному місці при температурі до +20°C. Термін придатності — 2 роки.',
  'Банка 35 г.',
  ARRAY['35 г'],
  35,
  180,
  '/images/dacha-tv/products/swarm-lure-01.jpg',
  'Приманка для роїв Dacha TV',
  true, true, 1
)
ON CONFLICT (slug) DO NOTHING;
