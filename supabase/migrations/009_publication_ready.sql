-- ─── Migration 009: Publication-ready pass ────────────────────────────────────
-- Renames honey slugs to SEO-friendly English slugs, updates all honey product
-- content + prices to launch copy, renames swarm-lure, replaces FAQ items.
-- All statements are idempotent.

-- ─── Fix logo path in site_settings ──────────────────────────────────────────
-- (no DB change needed — logo paths are resolved in code)

-- ─── Honey products: rename slugs ────────────────────────────────────────────

UPDATE honey_products SET slug = 'acacia-honey'
  WHERE slug = 'akatsiya'
    AND NOT EXISTS (SELECT 1 FROM honey_products WHERE slug = 'acacia-honey');

UPDATE honey_products SET slug = 'linden-honey'
  WHERE slug = 'lypa'
    AND NOT EXISTS (SELECT 1 FROM honey_products WHERE slug = 'linden-honey');

UPDATE honey_products SET slug = 'sunflower-honey'
  WHERE slug = 'sonyakh'
    AND NOT EXISTS (SELECT 1 FROM honey_products WHERE slug = 'sunflower-honey');

UPDATE honey_products SET slug = 'wildflower-honey'
  WHERE slug = 'riznotravya'
    AND NOT EXISTS (SELECT 1 FROM honey_products WHERE slug = 'wildflower-honey');

UPDATE honey_products SET slug = 'orchard-honey'
  WHERE slug = 'sadovyi'
    AND NOT EXISTS (SELECT 1 FROM honey_products WHERE slug = 'orchard-honey');

UPDATE honey_products SET slug = 'forest-honey'
  WHERE slug = 'lisovyi'
    AND NOT EXISTS (SELECT 1 FROM honey_products WHERE slug = 'forest-honey');

-- ─── Honey products: upsert with launch content ───────────────────────────────

INSERT INTO honey_products (
  slug, name, variety,
  short_description, full_description,
  aroma_notes, taste_notes, color_note,
  crystallization_note, recommended_use,
  packaging, packaging_note,
  price_plastic_uah, price_glass_uah,
  image_url, image_alt,
  is_featured, in_stock, display_order
) VALUES

('acacia-honey',
 'Акацієвий мед', 'Акація',
 'Ніжний, світлий мед із делікатним ароматом та повільною кристалізацією.',
 'Акацієвий мед цінується за м''який смак, світлий відтінок і легкий квітковий аромат. Це один із найбільш делікатних сортів, який довше залишається рідким і добре підходить для щоденного вживання.',
 'Легкий квітковий, ненав''язливий', 'Ніжний, злегка вершковий, без різких відтінків', 'Дуже світлий, майже прозорий',
 'Кристалізується дуже повільно — іноді залишається рідким до року і довше.',
 'Щоденне вживання, чай, дитяче харчування, подарунки.',
 ARRAY['1 л пластик', '1 л скло'], '1 л. Пластикова та скляна банка.',
 320, 360,
 '/images/dacha-tv/honey/acacia-honey-01.jpg', 'Акацієвий мед Dacha TV',
 true, true, 1),

('linden-honey',
 'Липовий мед', 'Липа',
 'Класичний запашний мед із виразним ароматом липового цвіту.',
 'Липовий мед має насичений аромат, характерний трав''янисто-квітковий профіль і традиційно вважається одним із найулюбленіших сортів. Добре підходить до чаю та для домашнього запасу.',
 'Насичений, квітково-трав''янистий', 'Насичений, з легкою приємною гіркуватістю', 'Від світло-жовтого до золотисто-янтарного',
 'Кристалізується за 2–3 місяці. Кристали середнього розміру.',
 'Чай, щоденне вживання, підтримка імунітету в сезон застуд.',
 ARRAY['1 л пластик', '1 л скло'], '1 л. Пластикова та скляна банка.',
 300, 340,
 '/images/dacha-tv/honey/linden-honey-01.jpg', 'Липовий мед Dacha TV',
 true, true, 2),

('sunflower-honey',
 'Соняшниковий мед', 'Сонях',
 'Насичений золотистий мед із виразним смаком і швидшою кристалізацією.',
 'Соняшниковий мед має яскравий колір, щільнішу текстуру та характерний солодкий смак. Це популярний повсякденний сорт, добре знайомий багатьом покупцям.',
 'Характерний, теплий, медово-квітковий', 'Насичений, жирний, виразний соняшниковий', 'Яскраво-золотистий, насичений',
 'Кристалізується дуже швидко — за 2–4 тижні після відкачки. Кристали дрібні й тверді.',
 'Намазати на хліб, додати в кашу. Підходить для тривалого зберігання.',
 ARRAY['1 л пластик', '1 л скло'], '1 л. Пластикова та скляна банка.',
 270, 310,
 '/images/dacha-tv/honey/sunflower-honey-01.jpg', 'Соняшниковий мед Dacha TV',
 true, true, 3),

('wildflower-honey',
 E'Мед різнотрав''я', E'Різнотрав''я',
 E'Багатий природний смак із поєднанням нектару різних польових рослин.',
 E'Мед різнотрав''я збирається з багатьох літніх квітів, тому має багатший і глибший смаковий профіль. Кожна партія може мати свій характер залежно від сезону та медоносів.',
 E'Складний, багатошаровий, природний', E'Глибокий, зі змінним характером залежно від партії', 'Від золотистого до янтарного',
 E'Кристалізується за 1–3 місяці залежно від складу нектару.',
 E'Універсальний. Щоденне вживання, випічка, чай.',
 ARRAY['1 л пластик', '1 л скло'], '1 л. Пластикова та скляна банка.',
 290, 330,
 '/images/dacha-tv/honey/wildflower-honey-01.jpg', E'Мед різнотрав''я Dacha TV',
 false, true, 4),

('orchard-honey',
 'Садовий мед', 'Сади',
 E'Ароматний мед із м''яким фруктово-квітковим характером.',
 E'Садовий мед формується з весняного цвіту плодових дерев та інших садових медоносів. Він має приємний квітковий аромат і м''який смак, який добре підходить для сімейного столу.',
 E'Квітково-фруктовий, весняний', E'М''який, ніжний, з фруктовими нотками', 'Світло-жовтий, прозорий',
 E'Кристалізується за 2–3 місяці. Кристали м''які та дрібні.',
 'Чай, десерти, сир. Ідеально для сімейного столу.',
 ARRAY['1 л пластик', '1 л скло'], '1 л. Пластикова та скляна банка.',
 310, 350,
 '/images/dacha-tv/honey/orchard-honey-01.jpg', 'Садовий мед Dacha TV',
 false, true, 5),

('forest-honey',
 'Лісовий мед', 'Ліс',
 'Глибший, більш насичений смак із виразним природним характером.',
 'Лісовий мед зазвичай має темніший відтінок, більш глибокий аромат і насичений смак. Це добрий вибір для тих, хто любить більш яскравий медовий профіль.',
 'Смолистий, деревний, складний', 'Темний, насичений, з мінеральними нотками', 'Темно-янтарний, коричнюватий',
 'Кристалізується повільно. Може зберігатися рідким тривалий час.',
 'Для цінителів — самостійно або до страв із м''ясом та сирами.',
 ARRAY['1 л пластик', '1 л скло'], '1 л. Пластикова та скляна банка.',
 330, 370,
 '/images/dacha-tv/honey/forest-honey-01.jpg', 'Лісовий мед Dacha TV',
 false, true, 6)

ON CONFLICT (slug) DO UPDATE SET
  name                 = EXCLUDED.name,
  variety              = EXCLUDED.variety,
  short_description    = EXCLUDED.short_description,
  full_description     = EXCLUDED.full_description,
  aroma_notes          = EXCLUDED.aroma_notes,
  taste_notes          = EXCLUDED.taste_notes,
  color_note           = EXCLUDED.color_note,
  crystallization_note = EXCLUDED.crystallization_note,
  recommended_use      = EXCLUDED.recommended_use,
  packaging            = EXCLUDED.packaging,
  packaging_note       = EXCLUDED.packaging_note,
  price_plastic_uah    = EXCLUDED.price_plastic_uah,
  price_glass_uah      = EXCLUDED.price_glass_uah,
  image_url            = EXCLUDED.image_url,
  image_alt            = EXCLUDED.image_alt,
  is_featured          = EXCLUDED.is_featured,
  display_order        = EXCLUDED.display_order;

-- ─── Apiary products: rename swarm lure slug ─────────────────────────────────

UPDATE apiary_products
  SET slug = 'swarm-lure'
  WHERE slug IN ('frey-swarm-lure', 'primanka-dlya-royiv')
    AND NOT EXISTS (SELECT 1 FROM apiary_products WHERE slug = 'swarm-lure');

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
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  description       = EXCLUDED.description,
  full_description  = EXCLUDED.full_description,
  usage_notes       = EXCLUDED.usage_notes,
  storage_info      = EXCLUDED.storage_info,
  packaging_note    = EXCLUDED.packaging_note,
  packaging         = EXCLUDED.packaging,
  weight_g          = EXCLUDED.weight_g,
  price_uah         = EXCLUDED.price_uah,
  image_url         = EXCLUDED.image_url,
  image_alt         = EXCLUDED.image_alt,
  is_featured       = EXCLUDED.is_featured;

-- ─── FAQ items: replace with launch set ───────────────────────────────────────

DELETE FROM faq_items;

INSERT INTO faq_items (question, answer, category, display_order) VALUES

('Як замовити мед?',
 'Ви можете залишити заявку на сайті або зателефонувати нам напряму. Ми уточнимо сорт, упаковку та спосіб доставки.',
 'ordering', 1),

('Які сорти меду у вас є?',
 'Наявність залежить від сезону. Основні сорти: акація, липа, сонях, різнотрав''я, садовий та лісовий мед.',
 'products', 1),

('У якій упаковці доступний мед?',
 'Основні варіанти: 1 л пластик та 1 л скло.',
 'products', 2),

('Чи є доставка по Україні?',
 'Так, ми відправляємо замовлення по Україні службами доставки.',
 'delivery', 1),

('Чи можна замовити самовивіз?',
 'Так, деталі самовивозу узгоджуються під час оформлення.',
 'delivery', 2),

('Як швидко ви відповідаєте?',
 'Зазвичай відповідаємо протягом кількох годин.',
 'ordering', 2),

('Чи є у вас продукція для пасічників?',
 'Так, окрім меду, ми маємо продукцію для пасічників, зокрема приманку для роїв.',
 'beekeeping', 1),

('Чи весь мед натуральний?',
 'Так, ми продаємо натуральний мед із власної сімейної пасіки.',
 'products', 3),

('Чому деяких сортів може тимчасово не бути?',
 'Мед є сезонним продуктом, тому окремі сорти можуть бути недоступні в окремі періоди.',
 'products', 4),

('Чи можна уточнити деталі перед замовленням?',
 'Так, ми завжди можемо проконсультувати перед оформленням заявки.',
 'ordering', 3);
