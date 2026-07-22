-- ============================================================================
-- Migration: 20260721233000_set_based_catalog_refresh_v6
-- ============================================================================
-- Fixes GET /api/admin/cron/import-products?limit=10000 returning HTTP 504.
--
-- Root cause: syncProductsToCatalog refreshed every EXISTING catalog row that
-- matched an unapproved supplier row through sequential per-SKU UPDATE calls
-- (one PostgREST round-trip per SKU, per changed field). At limit=10000 that is
-- tens of thousands of round-trips — far past the serverless timeout. The daily
-- feed is ~112,000 rows, so shrinking the HTTP batch size is not a fix; the
-- refresh itself must become one set-based statement.
--
-- This migration adds ONE additive, idempotent, SECURITY DEFINER function that
-- does the entire existing-row refresh (price + images + stock, honoring manual
-- locks) as a single UPDATE ... FROM, then approves ONLY the supplier rows
-- whose catalog row the UPDATE's RETURNING clause actually confirmed touching
-- (not "every candidate selected" — a stricter, race-safe guarantee). New
-- (not-yet-in-catalog) supplier products are NOT handled here — they stay on
-- the JS insert path (see lib/catalog/pipeline.ts), which was never the slow
-- part.
--
-- No destructive operation. No existing table/column/data touched other than
-- the normal UPDATE writes the old per-row code already performed, plus one
-- new idempotent partial index (see bottom of file).
-- ============================================================================

create or replace function public.refresh_existing_catalog_from_supplier(p_limit integer default 1000)
returns table (
  processed           integer,
  updated             integer,
  approved            integer,
  remaining_existing  integer,
  remaining_new       integer,
  remaining_total     integer,
  blocked_manual      integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit    integer := greatest(1, least(coalesce(p_limit, 1000), 10000));
  v_updated  integer := 0;
  v_approved integer := 0;
begin
  -- ── Candidate batch: unapproved supplier rows that already have a matching,
  -- non-manual catalog_products row. FOR UPDATE ... SKIP LOCKED on the supplier
  -- row makes concurrent invocations safe — PostgreSQL documents SKIP LOCKED as
  -- suitable for multiple consumers processing a queue-like table; two
  -- overlapping calls never claim the same rows, each just processes whatever
  -- is not already locked. Stable ordering (sp.id) makes repeated calls
  -- progress deterministically.
  create temporary table if not exists _refresh_candidates on commit drop as
  select
    sp.id                as supplier_id,
    sp.supplier_sku      as supplier_sku,
    sp.price_uah         as sp_price_uah,
    sp.main_image_url    as sp_main_image_url,
    sp.images            as sp_images,
    sp.stock_quantity    as sp_stock_quantity,
    sp.is_in_stock       as sp_is_in_stock,
    cp.id                as catalog_id,
    cp.price_manual_lock as price_manual_lock,
    cp.image_manual_lock as image_manual_lock
  from supplier_products sp
  join catalog_products cp on cp.supplier_sku = sp.supplier_sku
  where sp.is_approved = false
    and sp.name is not null
    and sp.price_uah > 0
    and coalesce(cp.source, 'supplier') <> 'manual'
  order by sp.id
  limit v_limit
  for update of sp skip locked;

  -- ── One set-based UPDATE for the whole batch. Price/images only change when
  -- the corresponding manual lock is NOT set; stock always refreshes (it is
  -- purely operational and has no manual-lock concept). Negative/null supplier
  -- stock normalizes to 0 (out of stock) — the same safe default the JS
  -- `normalizeStock()` helper used. is_in_stock is true when quantity > 0 or the
  -- supplier's own flag says so, matching lib/catalog/stock.ts's normalizeStock.
  --
  -- RETURNING captures the supplier_id of every row this UPDATE actually
  -- touched into _refreshed_ids — approval below is keyed STRICTLY off that
  -- set, not off _refresh_candidates. If the UPDATE statement itself errors
  -- (e.g. a constraint violation on one row), Postgres aborts the whole
  -- function call and the entire transaction rolls back: nothing is refreshed
  -- and nothing is approved. There is no partial-success state to leak.
  create temporary table if not exists _refreshed_ids on commit drop as
  with updated_rows as (
    update catalog_products cp
    set
      price_uah = case
        when not c.price_manual_lock and c.sp_price_uah is not null and c.sp_price_uah > 0
          then c.sp_price_uah
        else cp.price_uah
      end,
      main_image_url = case when not c.image_manual_lock then c.sp_main_image_url else cp.main_image_url end,
      images         = case when not c.image_manual_lock then c.sp_images         else cp.images         end,
      stock_quantity = greatest(0, coalesce(c.sp_stock_quantity, 0)),
      is_in_stock    = (coalesce(c.sp_stock_quantity, 0) > 0) or (c.sp_is_in_stock is true),
      stock_synced_at = now(),
      updated_at      = now()
    from _refresh_candidates c
    where cp.id = c.catalog_id
    returning c.supplier_id
  )
  select supplier_id from updated_rows;

  select count(*) into v_updated from _refreshed_ids;

  -- ── Approve STRICTLY the supplier ids returned by the UPDATE above via
  -- _refreshed_ids — never the broader _refresh_candidates set. v_approved is
  -- itself taken from THIS update's own RETURNING, not assumed equal to
  -- v_updated, so "approved" only ever counts rows whose approval write is
  -- itself confirmed. If this UPDATE errors, the whole function aborts and
  -- nothing commits (see comment above) — the supplier rows stay unapproved,
  -- to be retried on the next call.
  with approved_rows as (
    update supplier_products sp
    set is_approved = true
    from _refreshed_ids r
    where sp.id = r.supplier_id
    returning sp.id
  )
  select count(*) into v_approved from approved_rows;

  -- Single result row: processed/updated/approved from this batch, plus the
  -- remaining backlog split into three buckets:
  --   remaining_existing — actionable by this RPC next call
  --   remaining_new      — actionable by the JS insert path next call
  --   blocked_manual     — NEVER actionable by either path (a human owns the
  --                        matching catalog row); reported for diagnostics
  --                        only and deliberately excluded from remaining_total
  --                        so a caller looping "until remaining = 0" actually
  --                        terminates once all real work is done.
  return query
  select
    r.processed, r.updated, r.approved, r.remaining_existing, r.remaining_new,
    (r.remaining_existing + r.remaining_new)::integer as remaining_total,
    r.blocked_manual
  from (
    select
      (select count(*) from _refresh_candidates)::integer as processed,
      v_updated::integer as updated,
      v_approved::integer as approved,
      (
        select count(*)::integer
        from supplier_products sp
        join catalog_products cp on cp.supplier_sku = sp.supplier_sku
        where sp.is_approved = false
          and sp.name is not null
          and sp.price_uah > 0
          and coalesce(cp.source, 'supplier') <> 'manual'
      ) as remaining_existing,
      (
        select count(*)::integer
        from supplier_products sp
        where sp.is_approved = false
          and sp.name is not null
          and sp.price_uah > 0
          and not exists (
            select 1 from catalog_products cp where cp.supplier_sku = sp.supplier_sku
          )
      ) as remaining_new,
      (
        select count(*)::integer
        from supplier_products sp
        join catalog_products cp on cp.supplier_sku = sp.supplier_sku
        where sp.is_approved = false
          and sp.name is not null
          and sp.price_uah > 0
          and coalesce(cp.source, 'supplier') = 'manual'
      ) as blocked_manual
  ) r;
end;
$$;

comment on function public.refresh_existing_catalog_from_supplier(integer) is
  'Set-based replacement for the old per-SKU refresh loop in syncProductsToCatalog. Refreshes price/images (honoring price_manual_lock/image_manual_lock) and stock (always, for non-manual rows) for a bounded batch of existing catalog_products rows matched to unapproved supplier_products by supplier_sku, then approves ONLY the supplier rows whose catalog row the UPDATE...RETURNING confirmed touching. Safe under concurrent calls via FOR UPDATE SKIP LOCKED. Never touches source=''manual'' rows (reported separately as blocked_manual) or new (not-yet-in-catalog) supplier products (reported as remaining_new).';

-- Service-role only — mirrors every other pipeline RPC/table in this project.
revoke all on function public.refresh_existing_catalog_from_supplier(integer) from public;
revoke all on function public.refresh_existing_catalog_from_supplier(integer) from anon;
revoke all on function public.refresh_existing_catalog_from_supplier(integer) from authenticated;
grant execute on function public.refresh_existing_catalog_from_supplier(integer) to service_role;

-- ── Queue index ──────────────────────────────────────────────────────────────
-- The existing idx_supplier_products_eligible (is_approved, is_in_stock,
-- price_uah) where is_approved=false does not cover this RPC's actual
-- predicate (name IS NOT NULL, price_uah > 0) or its ORDER BY id, so it cannot
-- be used for an index-only ordered scan of the queue. Add a dedicated partial
-- index matching the exact WHERE clause used above and in the JS new-product
-- scan (lib/catalog/pipeline.ts's insertNewSupplierProducts) — idempotent, and
-- only meaningfully different from the existing index, so both are kept.
create index if not exists idx_supplier_products_actionable_queue
  on supplier_products (id)
  where is_approved = false and name is not null and price_uah > 0;

comment on index idx_supplier_products_actionable_queue is
  'Supports the ordered, bounded queue scan in refresh_existing_catalog_from_supplier() and insertNewSupplierProducts() — matches their exact WHERE clause (is_approved=false, name IS NOT NULL, price_uah > 0) with id for stable ORDER BY.';
