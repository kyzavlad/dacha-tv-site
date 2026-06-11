-- Migration 040: Pipeline support
-- Adds partial unique index on catalog_categories.supplier_category_id so the
-- pipeline can upsert categories from supplier data without duplicates.
-- Idempotent — safe to re-run.

create unique index if not exists idx_catalog_categories_supplier_cat_id_unique
  on catalog_categories (supplier_category_id)
  where supplier_category_id is not null;

-- Index for filtering supplier_products eligible for catalog import
create index if not exists idx_supplier_products_eligible
  on supplier_products (is_approved, is_in_stock, price_uah)
  where is_approved = false;
