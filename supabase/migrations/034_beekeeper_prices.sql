-- Migration 034: Add price fields to beekeeper_products
ALTER TABLE beekeeper_products
  ADD COLUMN IF NOT EXISTS price_uah  numeric        NULL,
  ADD COLUMN IF NOT EXISTS price_note text           NULL;
