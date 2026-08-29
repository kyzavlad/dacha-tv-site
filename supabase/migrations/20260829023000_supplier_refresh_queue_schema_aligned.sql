-- ============================================================================
-- Migration: planner-stable supplier refresh queue index
-- ============================================================================
-- Production P0 follow-up, 2026-08-29.
--
-- supplier_products.name is schema-level NOT NULL. PostgreSQL simplifies the
-- existing-refresh predicate by removing `name IS NOT NULL` before planning.
-- The older actionable partial index included that redundant predicate and was
-- never selected in production (idx_scan=0); it had also accumulated substantial
-- bloat from repeated false -> true approval updates.
--
-- Keep the actual selective predicate (`price_uah > 0`) in the partial index and
-- make approval state a leading key. The refresh query's `is_approved = false`
-- becomes an Index Cond while id remains ordered for LIMIT/SKIP LOCKED batching.
-- Live EXPLAIN verified this exact access path before cleanup.
--
-- The cleanup removes the superseded historical queue index plus two temporary
-- diagnostic indexes created during the incident. `IF EXISTS` keeps fresh/staged
-- databases safe even when those diagnostic names were never created there.
-- ============================================================================

create index if not exists idx_supplier_products_approval_id_price_queue
  on public.supplier_products (is_approved, id)
  where price_uah > 0;

drop index if exists public.idx_supplier_products_actionable_queue;
drop index if exists public.idx_supplier_products_approval_id_queue;
drop index if exists public.idx_supplier_products_pending_refresh_id_v2;
