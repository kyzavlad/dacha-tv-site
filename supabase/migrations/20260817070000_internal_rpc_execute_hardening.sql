-- Dacha TV production hardening: internal mutation/trigger helpers must never
-- be callable through the public PostgREST roles.
--
-- The scheduled supplier/RRP pipeline uses SUPABASE_SERVICE_ROLE_KEY, so these
-- functions remain executable by service_role. Public catalog search is
-- intentionally NOT changed here because search_public_catalog_products_indexed
-- is the read-only storefront RPC used by anonymous visitors.

revoke execute on function public.apply_supplier_rrp_batch(jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_supplier_rrp_batch(jsonb)
  to service_role;

revoke execute on function public.backfill_category_slugs()
  from public, anon, authenticated;
grant execute on function public.backfill_category_slugs()
  to service_role;

-- Trigger functions are invoked by PostgreSQL triggers, not by browser clients.
-- Removing PostgREST-facing EXECUTE does not disable the triggers themselves.
revoke execute on function public.capture_supplier_base_price()
  from public, anon, authenticated;
grant execute on function public.capture_supplier_base_price()
  to service_role;

revoke execute on function public.enforce_supplier_rrp_on_catalog()
  from public, anon, authenticated;
grant execute on function public.enforce_supplier_rrp_on_catalog()
  to service_role;

-- Fix the remaining mutable-search-path warning for this simple trigger helper.
alter function public.set_updated_at()
  set search_path = pg_catalog, public;
