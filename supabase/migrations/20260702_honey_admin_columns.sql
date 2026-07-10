-- Migration: bring honey_products up to the full set of columns the admin
-- honey editor writes. The canonical rebuild (20260629_manual_content_tables.sql)
-- recreates honey_products with a MINIMAL column set (no status, no rich content
-- fields, no gallery/video/multi-youtube columns). On a DB provisioned from that
-- rebuild, saving a honey product (e.g. changing its price) failed with a
-- "column does not exist" error. This adds every missing column idempotently, so
-- it is safe whether or not the columns already exist (a DB that ran the older
-- 008/019/020/022 migrations already has them → all statements are no-ops).

-- Unified product status enum + column (mirrors migration 022).
DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('available', 'preorder', 'out_of_stock', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE honey_products
  ADD COLUMN IF NOT EXISTS status product_status NOT NULL DEFAULT 'available';

-- Rich content fields (mirrors migration 008).
ALTER TABLE honey_products
  ADD COLUMN IF NOT EXISTS short_description   text,
  ADD COLUMN IF NOT EXISTS full_description    text,
  ADD COLUMN IF NOT EXISTS aroma_notes         text,
  ADD COLUMN IF NOT EXISTS taste_notes         text,
  ADD COLUMN IF NOT EXISTS color_note          text,
  ADD COLUMN IF NOT EXISTS crystallization_note text,
  ADD COLUMN IF NOT EXISTS recommended_use     text,
  ADD COLUMN IF NOT EXISTS packaging_note      text;

-- Media backward-compat columns (mirrors migrations 019/020).
ALTER TABLE honey_products
  ADD COLUMN IF NOT EXISTS gallery_images     text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS video_url          text,
  ADD COLUMN IF NOT EXISTS youtube_video_urls text[] NOT NULL DEFAULT '{}';
