-- Ensure apiary products exist in DB (upsert by slug so repeated runs are idempotent).
-- Products inserted here will be served directly from DB; product_media rows added via
-- admin UI will then appear automatically without needing a static fallback.

INSERT INTO apiary_products (
  slug, name, status, display_order,
  description, short_description, full_description,
  composition, usage_notes, storage_info,
  packaging_note, packaging, price_uah, weight_g
)
VALUES
  (
    'flower-pollen',
    'Квітковий пилок',
    'available', 1,
    'Натуральний квітковий пилок зібраний на нашій пасіці.',
    'Свіжий квітковий пилок — джерело вітамінів, амінокислот та мікроелементів.',
    'Квітковий пилок містить понад 250 біологічно активних речовин. Рекомендується для підтримки імунітету та загального оздоровлення організму.',
    'Натуральний квітковий пилок',
    'Вживати по 1–2 чайні ложки на день, запиваючи водою або розчиняючи в меду.',
    'Зберігати в холодильнику або морозильній камері.',
    '50 г, 100 г',
    ARRAY['50 г', '100 г'],
    180, 100
  ),
  (
    'propolis',
    'Прополіс',
    'available', 2,
    'Натуральний прополіс із нашої пасіки.',
    'Натуральний прополіс — природний антисептик та імуностимулятор.',
    'Прополіс має сильні антибактеріальні та антивірусні властивості. Використовується як природний антисептик і для підтримки імунної системи.',
    NULL,
    'Вживати у вигляді настоянки або додавати до меду.',
    'Зберігати в прохолодному темному місці.',
    '20 г',
    ARRAY['20 г'],
    120, 20
  ),
  (
    'nuts-in-honey',
    'Горіхи в меду',
    'available', 3,
    'Суміш волоських горіхів і мигдалю в натуральному меду.',
    'Волоські горіхи та мигдаль у натуральному меді — корисне та смачне ласощі.',
    'Суміш відборних горіхів у натуральному меді. Енергетичний та поживний продукт, що поєднує корисні властивості меду та горіхів.',
    'Натуральний мед, волоські горіхи, мигдаль',
    'Вживати по 1–2 столові ложки на день як самостійний десерт або з хлібом.',
    'Зберігати в прохолодному темному місці. Термін придатності — 12 місяців.',
    '200 г, 500 г',
    ARRAY['200 г', '500 г'],
    230, 200
  )
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  status            = COALESCE(apiary_products.status, EXCLUDED.status),
  display_order     = COALESCE(apiary_products.display_order, EXCLUDED.display_order),
  description       = COALESCE(apiary_products.description, EXCLUDED.description),
  short_description = COALESCE(apiary_products.short_description, EXCLUDED.short_description),
  full_description  = COALESCE(apiary_products.full_description, EXCLUDED.full_description),
  composition       = COALESCE(apiary_products.composition, EXCLUDED.composition),
  usage_notes       = COALESCE(apiary_products.usage_notes, EXCLUDED.usage_notes),
  storage_info      = COALESCE(apiary_products.storage_info, EXCLUDED.storage_info),
  packaging_note    = COALESCE(apiary_products.packaging_note, EXCLUDED.packaging_note),
  packaging         = COALESCE(apiary_products.packaging, EXCLUDED.packaging),
  price_uah         = COALESCE(apiary_products.price_uah, EXCLUDED.price_uah),
  weight_g          = COALESCE(apiary_products.weight_g, EXCLUDED.weight_g);

-- Backfill image_url from product_media for rows where image_url is still null.
-- This ensures legacy code paths also see an image when product_media rows exist.
UPDATE apiary_products ap
SET image_url = pm.url
FROM product_media pm
WHERE pm.product_id = ap.id
  AND pm.product_section = 'apiary'
  AND pm.media_type = 'image'
  AND ap.image_url IS NULL
  AND pm.position = (
    SELECT MIN(p2.position)
    FROM product_media p2
    WHERE p2.product_id = ap.id
      AND p2.product_section = 'apiary'
      AND p2.media_type = 'image'
  );
