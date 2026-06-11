-- Migration 016: Create flower_products table
-- This migration must be run in Supabase SQL Editor before flowers can be used.
-- Run the full contents of this file once. It is idempotent.

CREATE TABLE IF NOT EXISTS flower_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text UNIQUE NOT NULL,
  category      text NOT NULL DEFAULT 'chrysanthemum',
  variety       text,
  short_description text,
  full_description  text,
  price_uah     numeric(10,2),
  color         text,
  bloom_season  text,
  height_cm     int,
  lighting      text,
  packaging_note text,
  display_order int NOT NULL DEFAULT 10,
  is_featured   boolean NOT NULL DEFAULT false,
  in_stock      boolean NOT NULL DEFAULT true,
  image_url     text,
  image_alt     text,
  youtube_video_url text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE flower_products ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='flower_products' AND policyname='Public read flower_products'
  ) THEN
    CREATE POLICY "Public read flower_products"
      ON flower_products FOR SELECT USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='flower_products' AND policyname='Service role all flower_products'
  ) THEN
    CREATE POLICY "Service role all flower_products"
      ON flower_products FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;
