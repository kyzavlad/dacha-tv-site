-- Add USD source price + exchange rate columns to supplier_products.
-- price_uah is still the canonical price used on storefront (computed on sync).
-- supplier_price_usd / supplier_price_rate are stored for traceability
-- and allow recomputing UAH if the rate changes.

ALTER TABLE supplier_products
  ADD COLUMN IF NOT EXISTS supplier_price_usd  numeric(12, 4),
  ADD COLUMN IF NOT EXISTS supplier_price_rate numeric(8,  4),
  ADD COLUMN IF NOT EXISTS last_price_synced_at timestamptz;
