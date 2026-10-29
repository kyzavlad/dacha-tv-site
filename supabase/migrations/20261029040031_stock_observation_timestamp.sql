-- Preserve the supplier observation timestamp during bounded refresh.
-- Current live function body, two stock-timestamp edits only.
-- No data backfill, permission, ownership, search_path or timeout change.
CREATE OR REPLACE FUNCTION public.refresh_existing_catalog_from_supplier(p_limit integer DEFAULT 5000)
 RETURNS TABLE(processed integer, updated integer, approved integer, remaining_existing integer, remaining_new integer, remaining_total integer, blocked_manual integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
 SET lock_timeout TO '5s'
AS $function$
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
    sp.last_synced_at    as sp_stock_observed_at,
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
      stock_synced_at = c.sp_stock_observed_at,
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
$function$;
