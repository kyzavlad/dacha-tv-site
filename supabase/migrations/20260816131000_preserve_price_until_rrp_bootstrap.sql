-- Bootstrap safety for the Personal.cab RRP price layer.
--
-- Production may briefly have supplier_products.our_price_uah = NULL before the
-- first successful get_products&rrp=on bootstrap. During that window a normal
-- supplier refresh must NOT wipe an already-published catalog price. Once an
-- official RRP exists it remains authoritative. Brand-new supplier rows without
-- RRP stay unpriced so the account/base supplier price can never leak publicly.

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

    if found and v_rrp is not null and v_rrp > 0 then
      -- Official Personal.cab retail/RRP is authoritative once available.
      new.price_uah := v_rrp;
    elsif tg_op = 'UPDATE' then
      -- Bootstrap period: preserve the currently published price until the
      -- first successful RRP sync rather than nulling the live catalog.
      new.price_uah := old.price_uah;
    else
      -- Never expose a base/account supplier price for a brand-new product
      -- before its official RRP has been received.
      new.price_uah := null;
    end if;
  end if;

  return new;
end;
$$;
