-- Complete the trigram search-index set used by searchPublishedCatalogProducts.
--
-- The storefront product text query ORs name_ua, name, supplier_sku and
-- category_slug for every token. The first three columns already have pg_trgm
-- GIN indexes from 20260630_catalog_search_indexes.sql, but category_slug did
-- not. One unindexed OR arm forced PostgreSQL into a full catalog sequential
-- scan for common searches (for example "вариатор" / "ремень вариатора"),
-- reaching the production statement timeout.
--
-- Additive and idempotent. It preserves search semantics exactly; no rows or
-- application behavior are changed.

create extension if not exists pg_trgm;

create index if not exists idx_cp_category_slug_trgm
  on public.catalog_products using gin (category_slug gin_trgm_ops);
