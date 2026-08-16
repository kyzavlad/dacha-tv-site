-- Personal.cab exposes two distinct price feeds:
--   * default get_products       = account/base price
--   * get_products&rrp=on        = supplier-calculated retail/RRP price
--
-- Keep supplier_products.price_uah as the base/account price for unit economics,
-- store official retail in supplier_products.our_price_uah, and guarantee that a
-- supplier-owned catalog row can never accidentally expose the base price.

-- 1) Preserve the supplier's USD base price from the already-synced plain feed.
-- The existing sync records price_win_field='price*rate(...)' when raw_data.price
-- is USD and price_uah is the converted account/base price.
create or replace function public.capture_supplier_base_price()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.price_win_field like 'price*rate%'
     and new.raw_data is not null
     and coalesce(new.raw_data->>'price', '') ~ '^[0-9]+([.][0-9]+)?$'
  then
    new.supplier_price_usd := (new.raw_data->>'price')::numeric;
    new.supplier_price_currency := 'USD';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_capture_supplier_base_price on public.supplier_products;
create trigger trg_capture_supplier_base_price
before insert or update of raw_data, price_win_field, supplier_price_usd
on public.supplier_products
for each row
execute function public.capture_supplier_base_price();

-- Backfill the existing plain-feed snapshot before any RRP values are introduced.
update public.supplier_products
set
  supplier_price_usd = (raw_data->>'price')::numeric,
  supplier_price_currency = 'USD'
where price_win_field like 'price*rate%'
  and raw_data is not null
  and coalesce(raw_data->>'price', '') ~ '^[0-9]+([.][0-9]+)?$';

comment on column public.supplier_products.price_uah is
  'Personal.cab account/base price in UAH from the default get_products feed. Never expose directly on supplier-owned storefront rows.';
comment on column public.supplier_products.our_price_uah is
  'Official Personal.cab retail/RRP price in UAH from get_products&rrp=on; authoritative supplier storefront price.';
comment on column public.supplier_products.supplier_price_usd is
  'Supplier/account base price in USD captured from the default Personal.cab feed when price_win_field is price*rate.';

-- 2) Hard DB guard: any supplier-owned catalog price write is replaced with the
-- official RRP. If the supplier row exists but RRP has not been synced yet, the
-- public price becomes NULL instead of leaking the base/account price. Manual
-- rows and explicitly price-locked rows remain fully human-owned.
create or replace function public.enforce_supplier_rrp_on_catalog()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rrp numeric;
begin
  if coalesce(new.source, 'supplier') <> 'manual'
     and new.supplier_sku is not null
     and coalesce(new.price_manual_lock, false) = false
  then
    select sp.our_price_uah
      into v_rrp
    from public.supplier_products sp
    where sp.supplier_sku = new.supplier_sku;

    -- Only enforce when this really is a supplier-backed row. FOUND remains true
    -- even when our_price_uah itself is NULL.
    if found then
      if v_rrp is not null and v_rrp > 0 then
        new.price_uah := v_rrp;
      else
        new.price_uah := null;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_supplier_rrp_on_catalog on public.catalog_products;
create trigger trg_enforce_supplier_rrp_on_catalog
before insert or update of price_uah, supplier_sku, price_manual_lock, source
on public.catalog_products
for each row
execute function public.enforce_supplier_rrp_on_catalog();

-- 3) Set-based RPC used by the application RRP sync. One JSON batch updates the
-- operational supplier layer and the already-existing storefront rows without
-- N per-product network round trips. Catalog manual locks are honored here and
-- again by the trigger above (defence in depth).
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
  )
  update public.supplier_products sp
  set
    our_price_uah = i.price_uah,
    last_price_synced_at = now(),
    updated_at = now()
  from incoming i
  where sp.supplier_sku = i.sku
    and sp.our_price_uah is distinct from i.price_uah;

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
  )
  update public.catalog_products cp
  set
    price_uah = i.price_uah,
    updated_at = now()
  from incoming i
  where cp.supplier_sku = i.sku
    and coalesce(cp.source, 'supplier') <> 'manual'
    and coalesce(cp.price_manual_lock, false) = false
    and cp.price_uah is distinct from i.price_uah;

  get diagnostics v_catalog = row_count;

  return query select v_supplier, v_catalog;
end;
$$;

revoke all on function public.apply_supplier_rrp_batch(jsonb) from public;
grant execute on function public.apply_supplier_rrp_batch(jsonb) to service_role;
