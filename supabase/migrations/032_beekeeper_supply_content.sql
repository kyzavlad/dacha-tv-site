-- Fill in missing content for beekeeper supply products (swarm-lure, wax-foundation).
-- Uses COALESCE so existing admin content is never overwritten.

UPDATE beekeeper_products
SET
  description = COALESCE(description,
    'Натуральна приманка для роїв на основі прополісу та ефірних олій — без хімії, перевірено в умовах Харківщини.'),
  full_description = COALESCE(full_description,
    'Приманка виготовлена виключно з компонентів власної пасіки: прополісної настоянки, бджолиного воску та ефірних олій. Імітує запах обжитого вулика, на який рій орієнтується при виборі нового місця. Наноситься на стінки роївні або дерев''яної пастки. Значно підвищує шанс заселення дикого рою. Не містить синтетичних атрактантів. Перевірено сезонами на нашій пасіці на Харківщині.'),
  season_note = COALESCE(season_note, 'Сезон використання — квітень–червень')
WHERE slug = 'swarm-lure';

UPDATE beekeeper_products
SET
  description = COALESCE(description,
    'Вощина під замовлення — стабільний стандарт, 100% натуральний бджолиний віск, пряма домовленість з виробником без посередників.'),
  full_description = COALESCE(full_description,
    'Виготовляємо вощину під конкретного клієнта: фіксований стандарт товщини та розміру, одна партія — одна якість. Без домішок парафіну. Якщо ви ФОП і плануєте реалізацію — достатньо отримати висновок ветеринарної лабораторії (привозите 2–3 листи, видають офіційний документ). Це дає право ставити власну етикетку й продавати легально. Ми беремо на себе виробництво — ви займаєтесь збутом. Обсяги, стандарт і ціну обговорюємо індивідуально. Залиште заявку — зв''яжемося і домовимося.')
WHERE slug = 'wax-foundation';

-- Backfill image_url from product_media for beekeeper products where legacy column is null.
UPDATE beekeeper_products bp
SET image_url = pm.url
FROM product_media pm
WHERE pm.product_id = bp.id
  AND pm.product_section = 'beekeeper'
  AND pm.media_type = 'image'
  AND bp.image_url IS NULL
  AND pm.position = (
    SELECT MIN(p2.position)
    FROM product_media p2
    WHERE p2.product_id = bp.id
      AND p2.product_section = 'beekeeper'
      AND p2.media_type = 'image'
  );
