-- Migration 019: Add gallery_images and youtube_video_urls to all product tables
-- Also adds full_description to beekeeper_products
-- All additions are idempotent (IF NOT EXISTS guards)

-- honey_products: gallery + multiple YouTube
ALTER TABLE honey_products
  ADD COLUMN IF NOT EXISTS gallery_images    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS youtube_video_urls text[] NOT NULL DEFAULT '{}';

-- apiary_products: already has gallery_images; add multiple YouTube
ALTER TABLE apiary_products
  ADD COLUMN IF NOT EXISTS youtube_video_urls text[] NOT NULL DEFAULT '{}';

-- beekeeper_products: gallery, multiple YouTube, rich text description
ALTER TABLE beekeeper_products
  ADD COLUMN IF NOT EXISTS gallery_images    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS youtube_video_urls text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS full_description  text;

-- flower_products: gallery + multiple YouTube
ALTER TABLE flower_products
  ADD COLUMN IF NOT EXISTS gallery_images    text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS youtube_video_urls text[] NOT NULL DEFAULT '{}';
