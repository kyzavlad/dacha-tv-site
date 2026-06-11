-- Migration 011: Add youtube_video_url to apiary_products
ALTER TABLE apiary_products
  ADD COLUMN IF NOT EXISTS youtube_video_url text;
