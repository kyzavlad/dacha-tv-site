-- Post-bootstrap cutover for the Personal.cab RRP retail-price layer.
--
-- During the first RRP bootstrap we temporarily preserved an existing catalog
-- price when a supplier row did not yet have a validated official RRP. That
-- avoided blanking the live storefront while ~112k feed rows were being
-- processed. The bootstrap has now populated the retail layer for essentially
-- all priced supplier rows, so preserving an old/base storefront price is no
-- longer safe: the small residual set can be missing RRP or can have an RRP
-- rejected by the base-price floor.
--
-- From this migration onward an unlocked supplier-owned catalog row is priced
-- only when supplier_products contains a positive official RRP that is at least
-- the current positive account/base price. Otherwise it fails closed to NULL.
-- Manual products and price_manual_lock=true remain operator-owned and are never
-- touched by this cutover.

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
    else
      -- Post-bootstrap fail-closed rule: never preserve/expose a supplier
      -- account/base price when a validated official retail RRP is unavailable.
      new.price_uah := null;
    end if;
  end if;

  return new;
end;
$$;

-- One-time cutover for residual supplier rows that were intentionally preserved
-- by the temporary bootstrap guard. The trigger above re-checks the same rule.
-- Keep this narrow: supplier-owned + unlocked + currently priced + no safe RRP.
update public.catalog_products cp
set
  price_uah = null,
  updated_at = now()
from public.supplier_products sp
where cp.supplier_sku = sp.supplier_sku
  and coalesce(cp.source, 'supplier') <> 'manual'
  and coalesce(cp.price_manual_lock, false) = false
  and cp.price_uah is not null
  and cp.price_uah > 0
  and not (
    sp.our_price_uah is not null
    and sp.our_price_uah > 0
    and sp.price_uah is not null
    and sp.price_uah > 0
    and sp.our_price_uah >= sp.price_uah
  );
