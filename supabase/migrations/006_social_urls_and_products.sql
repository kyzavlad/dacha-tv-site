-- 1. Seed real social URLs (COALESCE preserves any admin-set values)
UPDATE site_settings
SET
  youtube_url  = COALESCE(youtube_url,  'https://www.youtube.com/@dacha_tv'),
  facebook_url = COALESCE(facebook_url, 'https://facebook.com/kuzmenko.sergej'),
  tiktok_url   = COALESCE(tiktok_url,   'https://tiktok.com/@vladkuzmenkosxy')
WHERE id = 1;

-- 2. Extend apiary_products with rich content fields
ALTER TABLE apiary_products
  ADD COLUMN IF NOT EXISTS short_description text,
  ADD COLUMN IF NOT EXISTS composition       text,
  ADD COLUMN IF NOT EXISTS usage_notes       text,
  ADD COLUMN IF NOT EXISTS storage_info      text,
  ADD COLUMN IF NOT EXISTS weight_g          integer,
  ADD COLUMN IF NOT EXISTS is_featured       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gallery_images    text[];

-- 3. Add source tracking to inquiries
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS source text;

-- 4. Seed starter product: Приманка для роїв
INSERT INTO apiary_products (
  name,
  slug,
  description,
  short_description,
  composition,
  usage_notes,
  storage_info,
  weight_g,
  packaging,
  in_stock,
  is_featured,
  display_order,
  image_url,
  image_alt,
  gallery_images
) VALUES (
  'Приманка для роїв',
  'primanka-dlya-royiv',
  'Натуральна ефірна приманка для залучення та посадки бджолиних роїв. Виготовлена на основі натуральних компонентів, що імітують запах пропольованого вулика. Ефективна в радіусі до 500 метрів.',
  'Натуральна ефірна приманка для залучення роїв. 35 г.',
  'Натуральні ефірні масла (лемонграс, мелісса, лаванда), прополіс, бджолиний віск.',
  'Нанесіть невелику кількість на внутрішні стінки вулика-пастки або роїловні за 1–2 дні до передбачуваного роїння. Для кращого результату обробіть і льоток. Одного флакона вистачає на 3–5 застосувань.',
  'Зберігати в прохолодному темному місці при температурі до +20°C. Уникати прямих сонячних променів. Термін придатності — 2 роки.',
  35,
  ARRAY['35 г'],
  true,
  true,
  4,
  '/images/dacha-tv/products/primanka-dlya-royiv/cover.jpg',
  'Приманка для роїв Дача TV — натуральна, 35 г',
  ARRAY[
    '/images/dacha-tv/products/primanka-dlya-royiv/cover.jpg',
    '/images/dacha-tv/products/primanka-dlya-royiv/jars.jpg',
    '/images/dacha-tv/products/primanka-dlya-royiv/label.jpg'
  ]
)
ON CONFLICT (slug) DO UPDATE SET
  description       = EXCLUDED.description,
  short_description = EXCLUDED.short_description,
  composition       = EXCLUDED.composition,
  usage_notes       = EXCLUDED.usage_notes,
  storage_info      = EXCLUDED.storage_info,
  weight_g          = EXCLUDED.weight_g,
  packaging         = EXCLUDED.packaging,
  image_url         = EXCLUDED.image_url,
  image_alt         = EXCLUDED.image_alt,
  gallery_images    = EXCLUDED.gallery_images,
  is_featured       = EXCLUDED.is_featured;
