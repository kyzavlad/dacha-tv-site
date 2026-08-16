-- Loss-prevention floor for the Personal.cab RRP layer.
--
-- The default Personal.cab feed is our account/base price and rrp=on is the
-- supplier-calculated retail price. A malformed or stale RRP must never make a
-- supplier-owned storefront row cheaper than the current account/base price.
--
-- This migration keeps the existing RPC signature so the already-deployed
-- application can use it immediately. Invalid RRP rows are skipped; existing
-- catalog prices are left untouched by the batch. The catalog trigger also
-- refuses an already-stored RRP if a later base-price refresh rises above it.

create or replace function public.apply_supplier_rrp_batch(p_rows jsonb)
returns table(supplier_updated integer, catalog_updated integer)
language plpgsql
security definer
set search_path = public
set statement_timeout = '30s'
set lock_timeout = '5s'
as $$
declare
  v_supplier integer := 0;
  v_catalog integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  with incoming_raw as (
    select
      nullif(trim(x.sku), '') as sku,
      x.price_uah::numeric as price_uah
    from jsonb_to_recordset(p_rows) as x(sku text, price_uah numeric)
  ), incoming as (
    select distinct on (sku) sku, price_uah
    from incoming_raw
    where sku is not null and price_uah is not null and price_uah > 0
    order by sku
  ), valid as (
    select i.sku, i.price_uah
    from incoming i
    join public.supplier_products sp0 on sp0.supplier_sku = i.sku
    where sp0.price_uah is not null
      and sp0.price_uah > 0
      and i.price_uah >= sp0.price_uah
  )
  update public.supplier_products sp
  set
    our_price_uah = v.price_uah,
    last_price_synced_at = now(),
    updated_at = now()
  from valid v
  where sp.supplier_sku = v.sku
    and sp.our_price_uah is distinct from v.price_uah;

  get diagnostics v_supplier = row_count;

  with incoming_raw as (
    select
      nullif(trim(x.sku), '') as sku,
      x.price_uah::numeric as price_uah
    from jsonb_to_recordset(p_rows) as x(sku text, price_uah numeric)
  ), incoming as (
    select distinct on (sku) sku, price_uah
    from incoming_raw
    where sku is not null and price_uah is not null and price_uah > 0
    order by sku
  ), valid as (
    select i.sku, i.price_uah
    from incoming i
    join public.supplier_products sp0 on sp0.supplier_sku = i.sku
    where sp0.price_uah is not null
      and sp0.price_uah > 0
      and i.price_uah >= sp0.price_uah
  )
  update public.catalog_products cp
  set
    price_uah = v.price_uah,
    updated_at = now()
  from valid v
  where cp.supplier_sku = v.sku
    and coalesce(cp.source, 'supplier') <> 'manual'
    and coalesce(cp.price_manual_lock, false) = false
    and cp.price_uah is distinct from v.price_uah;

  get diagnostics v_catalog = row_count;

  return query select v_supplier, v_catalog;
end;
$$;

revoke all on function public.apply_supplier_rrp_batch(jsonb) from public;
grant execute on function public.apply_supplier_rrp_batch(jsonb) to service_role;

create or replace function public.enforce_supplier_rrp_on_catalog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rrp numeric;
  v_base numeric;
begin
  if coalesce(new.source, 'supplier') <> 'manual'
     and new.supplier_sku is not null
     and coalesce(new.price_manual_lock, false) = false
  then
    select sp.our_price_uah, sp.price_uah
      into v_rrp, v_base
    from public.supplier_products sp
    where sp.supplier_sku = new.supplier_sku;

    if found
       and v_rrp is not null and v_rrp > 0
       and v_base is not null and v_base > 0
       and v_rrp >= v_base
    then
      new.price_uah := v_rrp;
    elsif found
          and v_rrp is not null and v_rrp > 0
          and v_base is not null and v_base > 0
          and v_rrp < v_base
    then
      -- A later supplier cost increase can make a previously valid RRP unsafe.
      -- Fail closed instead of exposing a known below-cost storefront price.
      new.price_uah := null;
    elsif tg_op = 'UPDATE' then
      -- During the first RRP bootstrap, preserve the existing live price if no
      -- validated RRP exists yet. The batch RPC itself skips unknown-base rows.
      new.price_uah := old.price_uah;
    else
      new.price_uah := null;
    end if;
  end if;

  return new;
end;
$$;
