-- Preserve the supplier's original Russian product name in catalog_products.
-- The Ukrainian storefront keeps using name_ua; /ru uses name immediately while
-- catalog_product_translations is being enriched by the RU SEO workflow.
--
-- Additive/idempotent: only fills missing values and never overwrites a manual
-- or already curated Russian name.
update catalog_products cp
set
  name = nullif(trim(sp.name), ''),
  updated_at = now()
from supplier_products sp
where
  nullif(trim(cp.name), '') is null
  and nullif(trim(sp.name), '') is not null
  and (
    cp.supplier_product_id = sp.id
    or (
      cp.supplier_product_id is null
      and cp.supplier_sku is not null
      and cp.supplier_sku = sp.supplier_sku
    )
  );
