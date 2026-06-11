-- Migration 022: Unified product status system
-- Replaces the boolean in_stock with a 4-value status enum across all product tables.
-- Idempotent: IF NOT EXISTS / DO NOTHING guards throughout.

-- Create enum type (safe if it already exists)
DO $$ BEGIN
  CREATE TYPE product_status AS ENUM ('available', 'preorder', 'out_of_stock', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add status column to all 4 tables (default 'available' so existing rows are safe)
ALTER TABLE honey_products      ADD COLUMN IF NOT EXISTS status product_status NOT NULL DEFAULT 'available';
ALTER TABLE apiary_products     ADD COLUMN IF NOT EXISTS status product_status NOT NULL DEFAULT 'available';
ALTER TABLE flower_products     ADD COLUMN IF NOT EXISTS status product_status NOT NULL DEFAULT 'available';
ALTER TABLE beekeeper_products  ADD COLUMN IF NOT EXISTS status product_status NOT NULL DEFAULT 'available';

-- Map existing in_stock values: true → available, false → out_of_stock
-- WHERE status = 'available' guard prevents double-running from overwriting manual edits
UPDATE honey_products
  SET status = CASE WHEN in_stock THEN 'available'::product_status ELSE 'out_of_stock'::product_status END
  WHERE status = 'available';

UPDATE apiary_products
  SET status = CASE WHEN in_stock THEN 'available'::product_status ELSE 'out_of_stock'::product_status END
  WHERE status = 'available';

UPDATE flower_products
  SET status = CASE WHEN in_stock THEN 'available'::product_status ELSE 'out_of_stock'::product_status END
  WHERE status = 'available';

UPDATE beekeeper_products
  SET status = CASE WHEN in_stock THEN 'available'::product_status ELSE 'out_of_stock'::product_status END
  WHERE status = 'available';

-- Drop the old boolean column
ALTER TABLE honey_products      DROP COLUMN IF EXISTS in_stock;
ALTER TABLE apiary_products     DROP COLUMN IF EXISTS in_stock;
ALTER TABLE flower_products     DROP COLUMN IF EXISTS in_stock;
ALTER TABLE beekeeper_products  DROP COLUMN IF EXISTS in_stock;
