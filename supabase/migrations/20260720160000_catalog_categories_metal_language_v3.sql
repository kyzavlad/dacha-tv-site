-- ============================================================================
-- Migration: 20260720_catalog_categories_metal_language_v3
-- ============================================================================
-- Additive, idempotent, non-destructive. Safe to re-run. No table rewrite.
--
-- Defensive schema alignment for the v3 catalog-admin / category / metal work.
-- Everything here is "ensure it exists" — it fixes an environment where an
-- earlier migration (20260720_catalog_manual_ownership_and_sync_state or the
-- 040 pipeline index) was only partially applied, which is the most likely cause
-- of the category editor's save error (writing description_auto_generated to a
-- column that does not exist → 42703).
--
-- Data normalization (the 11 metal rows, category-name repair, description
-- backfill) is intentionally NOT done here — it runs through the bounded,
-- dry-run-by-default scripts with rollback artifacts (scripts/*).
-- ============================================================================

-- Shared updated_at trigger fn — self-contained + idempotent.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ── catalog_categories: columns the v3 editor + sync write ───────────────────
alter table catalog_categories add column if not exists description_auto_generated boolean not null default false;

comment on column catalog_categories.description_auto_generated is
  'True when catalog_categories.description was filled by the deterministic name-based fallback (sync or backfill). Hand-edited/legacy descriptions set it false so real content is never treated as a replaceable placeholder.';

-- ── catalog_products: per-field manual ownership locks (defensive) ───────────
alter table catalog_products add column if not exists price_manual_lock boolean not null default false;
alter table catalog_products add column if not exists image_manual_lock boolean not null default false;

-- ── Category stable-key integrity ────────────────────────────────────────────
-- Recreate the PARTIAL unique index on the stable supplier key (migration 040;
-- not recreated by the 20260628 rebuild). The v3 code no longer relies on
-- ON CONFLICT inference against this index (it uses an existence-check + plain
-- INSERT), but the index still protects against duplicate catalog rows for the
-- same supplier category. Partial (WHERE ... IS NOT NULL) so manual categories
-- (supplier_category_id NULL) are unconstrained.
create unique index if not exists idx_catalog_categories_supplier_cat_id_unique
  on catalog_categories (supplier_category_id)
  where supplier_category_id is not null;
