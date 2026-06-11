-- Migration 021: Delete non-canonical rows from beekeeper_products and apiary_products
-- Makes the catalog match exactly the canonical slugs used by the app.
-- Idempotent: DELETE WHERE slug NOT IN (...) is safe to run multiple times.

-- Beekeeper: keep only the 3 canonical slugs
DELETE FROM beekeeper_products
  WHERE slug NOT IN ('bee-packages', 'bee-colonies', 'empty-hives');

-- Re-ensure all 3 canonical beekeeper rows exist
INSERT INTO beekeeper_products (name, slug, product_type, description, breeds, season_note, display_order, in_stock)
VALUES
  ('Бджолопакети', 'bee-packages', 'bee_packages',
   'Бджолопакети порід Buckfast та Карніка. Спокійні, продуктивні породи. Доступні з квітня по червень.',
   ARRAY['Buckfast', 'Карніка'], 'Доступні з квітня по червень', 1, true),
  ('Бджолосімї',  'bee-colonies', 'bee_colonies',
   'Повноцінні бджолосімї у вуликах. Підходять для початківців і досвідчених пасічників.',
   ARRAY['Buckfast', 'Карніка'], 'Доступні з квітня по серпень', 2, true),
  ('Порожні вулики', 'empty-hives', 'empty_hives',
   'Порожні вулики для самостійного заселення. Уточнюйте наявність та конструкцію.',
   NULL, NULL, 3, true)
ON CONFLICT (slug) DO NOTHING;

-- Apiary: keep only the 4 canonical slugs
DELETE FROM apiary_products
  WHERE slug NOT IN ('swarm-lure', 'flower-pollen', 'propolis', 'nuts-in-honey');

-- Re-ensure all 4 canonical apiary rows exist
INSERT INTO apiary_products (
  name, slug, short_description, description, full_description,
  usage_notes, storage_info, packaging_note, packaging, weight_g,
  price_uah, image_url, image_alt, is_featured, in_stock, display_order
) VALUES
  (
    'Приманка для роїв', 'swarm-lure',
    'Готова приманка для приваблення бджолиних роїв у компактній зручній банці.',
    'Приманка для роїв використовується в сезон роїння для підвищення шансів заселення пастки або підготовленого вулика.',
    'Приманка для роїв використовується в сезон роїння для підвищення шансів заселення пастки або підготовленого вулика. Зручний формат банки дозволяє легко використовувати продукт у практичній роботі на пасіці.',
    'Нанесіть невелику кількість на внутрішні стінки вулика-пастки за 1–2 дні до очікуваного роїння. Також обробіть льоток. Повторіть через тиждень за потреби.',
    'Зберігати в прохолодному темному місці при температурі до +20°C. Термін придатності — 2 роки.',
    'Банка 35 г.', ARRAY['35 г'], 35, 180,
    '/images/dacha-tv/products/swarm-lure-01.jpg', 'Приманка для роїв Dacha TV',
    true, true, 1
  ),
  (
    'Квітковий пилок', 'flower-pollen',
    'Свіжий квітковий пилок — джерело вітамінів, амінокислот та мікроелементів.',
    'Натуральний квітковий пилок зібраний на нашій пасіці.',
    'Квітковий пилок містить понад 250 біологічно активних речовин. Рекомендується для підтримки імунітету та загального оздоровлення організму.',
    'Вживати по 1–2 чайні ложки на день, запиваючи водою або розчиняючи в меду.',
    'Зберігати в холодильнику або морозильній камері.',
    '50 г, 100 г', ARRAY['50 г', '100 г'], 100, 180,
    NULL, 'Квітковий пилок Dacha TV',
    false, true, 2
  ),
  (
    'Прополіс', 'propolis',
    'Натуральний прополіс — природний антисептик та імуностимулятор.',
    'Натуральний прополіс із нашої пасіки.',
    'Прополіс має сильні антибактеріальні та антивірусні властивості. Використовується як природний антисептик і для підтримки імунної системи.',
    'Вживати у вигляді настоянки або додавати до меду.',
    'Зберігати в прохолодному темному місці.',
    '20 г', ARRAY['20 г'], 20, 120,
    NULL, 'Прополіс Dacha TV',
    false, true, 3
  ),
  (
    'Горіхи в меду', 'nuts-in-honey',
    'Волоські горіхи та мигдаль у натуральному меді — корисне та смачне ласощі.',
    'Суміш волоських горіхів і мигдалю в натуральному меду.',
    'Суміш відборних горіхів у натуральному меді. Енергетичний та поживний продукт, що поєднує корисні властивості меду та горіхів.',
    'Вживати по 1–2 столові ложки на день як самостійний десерт або з хлібом.',
    'Зберігати в прохолодному темному місці. Термін придатності — 12 місяців.',
    '200 г, 500 г', ARRAY['200 г', '500 г'], 200, 230,
    NULL, 'Горіхи в меду Dacha TV',
    false, true, 4
  )
ON CONFLICT (slug) DO NOTHING;
