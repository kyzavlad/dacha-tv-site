-- Fill missing content for beekeeper products where fields are NULL
-- Uses slug as stable identifier. Safe to re-run (COALESCE keeps existing values).

UPDATE beekeeper_products
SET
  description = COALESCE(NULLIF(TRIM(description), ''),
    'Бджолопакети порід Buckfast та Карніка. Спокійні, продуктивні породи з хорошими показниками медозбору. Підходять як для початківців, так і для досвідчених пасічників. Реалізуємо з власної пасіки без посередників.'),
  full_description = COALESCE(NULLIF(TRIM(full_description), ''),
    'Бджолопакети з нашої пасіки — живі бджолині сім''ї у транспортувальних ящиках, готові до підсадки у вулик. Кожен пакет включає матку, розплід та достатньо кормових запасів для першого тижня. Перед реалізацією проводимо ветеринарний огляд. Бронюйте заздалегідь — кількість обмежена.'),
  season_note = COALESCE(NULLIF(TRIM(season_note), ''), 'Доступні з квітня по червень'),
  breeds = COALESCE(breeds, ARRAY['Buckfast', 'Карніка']),
  updated_at = NOW()
WHERE slug = 'bee-packages';

UPDATE beekeeper_products
SET
  description = COALESCE(NULLIF(TRIM(description), ''),
    'Повноцінні бджолосім''ї у вуликах Дадан. Породи Buckfast та Карніка — спокійні, продуктивні, стійкі до варроатозу. Підходять для початківців і досвідчених пасічників.'),
  full_description = COALESCE(NULLIF(TRIM(full_description), ''),
    'Бджолосім''я — це повноцінна сім''я з маткою, льотними та вуликовими бджолами, розплодом та кормовими запасами у вулику. На відміну від бджолопакету, вона готова до роботи з першого дня. Реалізуємо тільки здорові сім''ї, перевірені на варроатоз та нозематоз. Доставка або самовивіз із пасіки на Харківщині.'),
  season_note = COALESCE(NULLIF(TRIM(season_note), ''), 'Доступні з квітня по серпень'),
  breeds = COALESCE(breeds, ARRAY['Buckfast', 'Карніка']),
  updated_at = NOW()
WHERE slug = 'bee-colonies';

UPDATE beekeeper_products
SET
  description = COALESCE(NULLIF(TRIM(description), ''),
    'Порожні вулики для самостійного заселення. Дерев''яні корпуси типу Дадан. Уточнюйте наявність та конструкцію перед замовленням.'),
  full_description = COALESCE(NULLIF(TRIM(full_description), ''),
    'Виготовляємо та реалізуємо порожні вулики для пасічників-початківців і тих, хто розширює пасіку. Матеріал — соснова дошка, з'єднання «ластівчин хвіст». Можлива замовна збірка під нестандартні розміри рамок. Уточнюйте наявність конкретної конфігурації — телефонуйте або залишайте заявку.'),
  updated_at = NOW()
WHERE slug = 'empty-hives';

UPDATE beekeeper_products
SET
  description = COALESCE(NULLIF(TRIM(description), ''),
    'Приманка для роїв — ефективний засіб для залучення бджолиних роїв у пастки та підготовлені вулики в сезон роїння. Виготовлена на основі натуральних воскових компонентів.'),
  full_description = COALESCE(NULLIF(TRIM(full_description), ''),
    'Приманка використовується в сезон роїння для підвищення шансів заселення пасткових вуликів. Містить натуральний бджолиний віск та компоненти, що імітують запах живої бджолосім''ї. Невелика кількість наноситься на стінки вулика або пастки перед виставленням. Зручний формат банки дозволяє точно дозувати продукт. Зберігати в прохолодному місці, вдалині від прямих сонячних променів.'),
  season_note = COALESCE(NULLIF(TRIM(season_note), ''), 'Сезон роїння: квітень–липень'),
  updated_at = NOW()
WHERE slug = 'swarm-lure';

UPDATE beekeeper_products
SET
  description = COALESCE(NULLIF(TRIM(description), ''),
    'Натуральна вощина Dacha TV з якісного бджолиного воску. Підходить для стандартних рамок Дадан та інших типів вуликів. Рівна основа, чіткий відбиток стільника.'),
  full_description = COALESCE(NULLIF(TRIM(full_description), ''),
    'Вощина виготовляється з натурального бджолиного воску власної пасіки без домішок парафіну та хімічних замінників. Правильна шестикутна основа стільника прискорює відбудову рамок і сприяє продуктивному медозбору. Товщина та щільність підібрані для стандартних рамок Дадан 435×300 мм. За потреби уточнюйте розмір і кількість — відправляємо по Україні або самовивіз із пасіки.'),
  updated_at = NOW()
WHERE slug = 'wax-foundation';

-- Ensure all beekeeper products have their image_url synced from product_media
-- (the legacy column is updated by the admin on save; this just ensures
--  any product with product_media but stale/empty image_url gets it backfilled)
UPDATE beekeeper_products bp
SET image_url = pm.url,
    image_alt = COALESCE(bp.image_alt, pm.alt, bp.name),
    updated_at = NOW()
FROM (
  SELECT DISTINCT ON (product_id)
    product_id,
    url,
    alt
  FROM product_media
  WHERE product_section = 'beekeeper'
    AND media_type = 'image'
  ORDER BY product_id, is_primary DESC, position ASC
) pm
WHERE bp.id = pm.product_id
  AND (bp.image_url IS NULL OR bp.image_url = '');
