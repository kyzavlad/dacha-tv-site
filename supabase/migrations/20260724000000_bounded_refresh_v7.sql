-- ============================================================================
-- Migration: 20260724000000_bounded_refresh_v7
-- ============================================================================
-- Fixes the production import failure:
--   refresh_existing_catalog_from_supplier RPC failed:
--   canceling statement due to statement timeout
--
-- Root cause (v6): the function processes a BOUNDED batch (default 300, the
-- daily cron's size), but then — in the SAME transaction, on the hot path of
-- every single call — runs THREE exact whole-queue COUNT scans over the
-- ~112,000-row supplier_products table (joined to catalog_products) to report
-- remaining_existing / remaining_new / blocked_manual. Those full scans, not
-- the small bounded UPDATE, became the dominant cost and tripped the statement
-- timeout. Categories and the 112326/112326 product sync both completed; only
-- this import step timed out.
--
-- This migration (additive, idempotent, `create or replace` — the function
-- name, argument signature and return columns are all UNCHANGED, so no drop
-- and no dependent breaks):
--   1. Removes the three exact whole-table COUNT scans from the hot path. The
--      remaining_existing / remaining_new / remaining_total / blocked_manual
--      columns still EXIST in the return type (unchanged signature) but are now
--      returned as NULL on the fast path — the caller loops on real batch
--      progress (processed) instead, and asks for exact counts only when it
--      explicitly wants them (see catalog_refresh_queue_counts() below).
--   2. Adds controlled per-call statement_timeout and lock_timeout so a call
--      fails fast and predictably instead of hanging or being killed mid-work.
--   3. Raises the default batch from 1000 to 5000 (the API caller uses 5000 as
--      the normal existing-row refresh size; genuinely-new inserts stay capped
--      at 500 on the JS path — see lib/catalog/automation-config.ts).
--
-- The batch UPDATE + approval logic is copied verbatim from v6 — every safety
-- property is preserved unchanged:
--   • price_manual_lock / image_manual_lock still gate price/image writes
--   • stock is still always refreshed for non-manual rows
--   • source='manual' (manual + metal) rows are still excluded entirely
--   • approve-by-UPDATE...RETURNING atomicity is unchanged (approval is keyed
--     STRICTLY off the UPDATE's own RETURNING set; any error rolls back the
--     whole call — no refreshed-but-unapproved partial state)
--
-- A SEPARATE diagnostic-only function, catalog_refresh_queue_counts(), returns
-- the exact remaining counts for callers that genuinely need them (admin
-- dashboards, an explicit ?counts=true probe). It is NEVER on the import hot
-- path, so the daily job completes the full refresh without hundreds of
-- full-table COUNT scans.
--
-- No destructive operation. No table/column/data changed beyond the normal
-- UPDATE writes the refresh already performs.
-- ============================================================================

create or replace function public.refresh_existing_catalog_from_supplier(p_limit integer default 5000)
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
-- Controlled, per-call timeouts (requirement 9). The bounded batch below is
-- fast (a single set-based UPDATE over at most p_limit rows), so 30s is ample
-- headroom while still guaranteeing the call can never hang the connection;
-- lock_timeout is short so a contended row fails fast and is retried next call
-- rather than blocking. These are SET on the function so they apply only to
-- its own execution and revert automatically afterwards.
set statement_timeout = '30s'
set lock_timeout = '5s'
as $$
declare
  v_limit    integer := greatest(1, least(coalesce(p_limit, 5000), 10000));
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

  -- Single result row. processed/updated/approved are the REAL, cheap batch
  -- progress numbers the caller loops on. The remaining_* columns are returned
  -- as NULL here ON PURPOSE — the three exact whole-queue COUNT scans that used
  -- to live here were the timeout cause. A caller that genuinely needs exact
  -- backlog figures calls catalog_refresh_queue_counts() explicitly (a separate
  -- diagnostic function, off the import hot path). blocked_manual is likewise
  -- NULL here and available from that diagnostic function.
  return query
  select
    (select count(*) from _refresh_candidates)::integer as processed,
    v_updated::integer  as updated,
    v_approved::integer as approved,
    null::integer       as remaining_existing,
    null::integer       as remaining_new,
    null::integer       as remaining_total,
    null::integer       as blocked_manual;
end;
$$;

comment on function public.refresh_existing_catalog_from_supplier(integer) is
  'Set-based, bounded, restart-safe refresh of existing catalog_products rows matched to unapproved supplier_products by supplier_sku. Refreshes price/images (honoring price_manual_lock/image_manual_lock) and stock (always, for non-manual rows) for a bounded batch, then approves ONLY the supplier rows whose catalog row the UPDATE...RETURNING confirmed touching. Never touches source=''manual'' rows. v7: the exact whole-queue remaining COUNT scans were removed from this hot path (they caused a statement timeout on the ~112k-row queue); remaining_*/blocked_manual are returned NULL here — call catalog_refresh_queue_counts() for exact figures. Safe under concurrent calls via FOR UPDATE SKIP LOCKED; per-call statement_timeout/lock_timeout bound it.';

-- Service-role only — mirrors every other pipeline RPC/table in this project.
revoke all on function public.refresh_existing_catalog_from_supplier(integer) from public;
revoke all on function public.refresh_existing_catalog_from_supplier(integer) from anon;
revoke all on function public.refresh_existing_catalog_from_supplier(integer) from authenticated;
grant execute on function public.refresh_existing_catalog_from_supplier(integer) to service_role;

-- ── Diagnostic-only exact queue counts (NEVER on the import hot path) ─────────
-- The exact backlog split the import loop no longer needs on every call. Kept
-- as its own function so an admin dashboard or an explicit ?counts=true probe
-- can request it deliberately (requirement 6). It runs the same three scans the
-- old v6 hot path did, but only when a human/diagnostic asks — with a larger
-- statement_timeout because these ARE full-queue scans over ~112k rows.
--   remaining_existing — actionable by refresh_existing_catalog_from_supplier
--   remaining_new      — actionable by the JS new-insert path
--   blocked_manual     — never actionable by either (a human owns the catalog
--                        row); reported for visibility, excluded from remaining_total
create or replace function public.catalog_refresh_queue_counts()
returns table (
  remaining_existing  integer,
  remaining_new       integer,
  remaining_total     integer,
  blocked_manual      integer
)
language sql
stable
security definer
set search_path = public
set statement_timeout = '120s'
as $$
  with
  re as (
    select count(*)::integer as n
    from supplier_products sp
    join catalog_products cp on cp.supplier_sku = sp.supplier_sku
    where sp.is_approved = false
      and sp.name is not null
      and sp.price_uah > 0
      and coalesce(cp.source, 'supplier') <> 'manual'
  ),
  rn as (
    select count(*)::integer as n
    from supplier_products sp
    where sp.is_approved = false
      and sp.name is not null
      and sp.price_uah > 0
      and not exists (
        select 1 from catalog_products cp where cp.supplier_sku = sp.supplier_sku
      )
  ),
  bm as (
    select count(*)::integer as n
    from supplier_products sp
    join catalog_products cp on cp.supplier_sku = sp.supplier_sku
    where sp.is_approved = false
      and sp.name is not null
      and sp.price_uah > 0
      and coalesce(cp.source, 'supplier') = 'manual'
  )
  select
    re.n as remaining_existing,
    rn.n as remaining_new,
    (re.n + rn.n)::integer as remaining_total,
    bm.n as blocked_manual
  from re, rn, bm;
$$;

comment on function public.catalog_refresh_queue_counts() is
  'Diagnostic-only exact import-queue backlog: remaining_existing (refreshable), remaining_new (new-insertable) and blocked_manual (shadowed by a source=manual catalog row). These are the three full-queue COUNT scans removed from refresh_existing_catalog_from_supplier''s hot path in v7 — call this deliberately (dashboard / explicit ?counts=true), never in the per-batch import loop.';

revoke all on function public.catalog_refresh_queue_counts() from public;
revoke all on function public.catalog_refresh_queue_counts() from anon;
revoke all on function public.catalog_refresh_queue_counts() from authenticated;
grant execute on function public.catalog_refresh_queue_counts() to service_role;

-- ── Equality-join index on catalog_products(supplier_sku) (requirement 7) ─────
-- The refresh candidate scan joins catalog_products to supplier_products on
-- supplier_sku for equality. catalog_products.supplier_sku was declared
-- `text unique`, so a UNIQUE btree index already backs that join — but the
-- only other index on the column is a GIN trigram index (for search LIKE/
-- similarity), which cannot serve an equality join. This DO block VERIFIES a
-- usable btree index exists and creates a plain one only if it is genuinely
-- missing (e.g. if the unique constraint were ever dropped), so we never add a
-- redundant duplicate of the existing unique index.
do $$
begin
  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename  = 'catalog_products'
      and indexdef ilike '%using btree%'
      and indexdef ~ '\(supplier_sku\)'
  ) then
    create index idx_catalog_products_supplier_sku on catalog_products (supplier_sku);
  end if;
end $$;
