-- Migration 020: Add video_url to all product tables; clean up beekeeper duplicates
-- All additions are idempotent (IF NOT EXISTS guards)

-- Add dedicated video_url column (for local-uploaded video files, distinct from YouTube)
ALTER TABLE honey_products      ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE apiary_products     ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE beekeeper_products  ADD COLUMN IF NOT EXISTS video_url text;
ALTER TABLE flower_products     ADD COLUMN IF NOT EXISTS video_url text;

-- Remove stale beekeeper rows from before migration 018 canonical rename.
-- Only targets known-bad slugs; canonical rows are preserved via ON CONFLICT.
DELETE FROM beekeeper_products
  WHERE slug IN (
    'bee-package-buckfast', 'bee-package-carnica', 'bee-colony',
    'bdzholopakety', 'bdzholosimi'
  );

-- Re-ensure all 3 canonical beekeeper rows exist after cleanup
INSERT INTO beekeeper_products (name, slug, product_type, description, breeds, season_note, display_order, in_stock)
VALUES
  ('Бджолопакети', 'bee-packages', 'bee_packages',
   'Бджолопакети порід Buckfast та Карніка. Спокійні, продуктивні породи.',
   ARRAY['Buckfast', 'Карніка'], 'Доступні з квітня по червень', 1, true),
  ('Бджолосімї',  'bee-colonies', 'bee_colonies',
   'Повноцінні бджолосімї у вуликах. Підходять для початківців і досвідчених пасічників.',
   ARRAY['Buckfast', 'Карніка'], 'Доступні з квітня по серпень', 2, true),
  ('Порожні вулики', 'empty-hives', 'empty_hives',
   'Порожні вулики для самостійного заселення. Уточнюйте наявність та конструкцію.',
   NULL, NULL, 3, true)
ON CONFLICT (slug) DO NOTHING;
