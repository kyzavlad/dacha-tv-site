-- Migration 018: Add missing columns to beekeeper_products, rename slugs to English
-- All alterations are idempotent (IF NOT EXISTS / NOT EXISTS guards)

ALTER TABLE beekeeper_products
  ADD COLUMN IF NOT EXISTS in_stock      boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_featured   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS youtube_video_url text;

-- Rename Ukrainian slugs to English canonical slugs
UPDATE beekeeper_products
  SET slug = 'bee-packages'
  WHERE slug IN ('bdzholopakety', 'bee-package-buckfast', 'bee-package-carnica')
    AND NOT EXISTS (SELECT 1 FROM beekeeper_products WHERE slug = 'bee-packages');

UPDATE beekeeper_products
  SET slug = 'bee-colonies'
  WHERE slug IN ('bdzholosimi', 'bee-colony')
    AND NOT EXISTS (SELECT 1 FROM beekeeper_products WHERE slug = 'bee-colonies');

-- Ensure all three canonical beekeeper products exist
INSERT INTO beekeeper_products (name, slug, product_type, description, breeds, season_note, display_order, in_stock)
VALUES (
  'Бджолопакети', 'bee-packages', 'bee_packages',
  'Бджолопакети порід Buckfast та Карніка. Спокійні, продуктивні породи. Доступні з квітня по червень.',
  ARRAY['Buckfast', 'Карніка'],
  'Доступні з квітня по червень',
  1, true
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO beekeeper_products (name, slug, product_type, description, breeds, season_note, display_order, in_stock)
VALUES (
  'Бджолосімї', 'bee-colonies', 'bee_colonies',
  'Повноцінні бджолосімї у вуликах. Підходять для початківців і досвідчених пасічників.',
  ARRAY['Buckfast', 'Карніка'],
  'Доступні з квітня по серпень',
  2, true
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO beekeeper_products (name, slug, product_type, description, display_order, in_stock)
VALUES (
  'Порожні вулики', 'empty-hives', 'empty_hives',
  'Порожні вулики для самостійного заселення. Уточнюйте наявність та конструкцію.',
  3, true
)
ON CONFLICT (slug) DO NOTHING;

-- Delete old duplicate rows that were renamed away (bee-package-buckfast, bee-package-carnica, bee-colony)
-- Only if they are true duplicates and the canonical slug already exists
DELETE FROM beekeeper_products
  WHERE slug IN ('bee-package-buckfast', 'bee-package-carnica', 'bee-colony')
    AND EXISTS (SELECT 1 FROM beekeeper_products WHERE slug = 'bee-packages');
