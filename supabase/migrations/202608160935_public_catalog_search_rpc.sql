-- Public catalog text search runs through a narrow SECURITY DEFINER RPC so
-- PostgreSQL may use the existing pg_trgm indexes. Direct anon ILIKE queries on
-- catalog_products are forced through the table's RLS security barrier and can
-- degrade to a full scan on multi-token searches.
--
-- Security invariants:
-- - only status='published' rows are returned;
-- - only the exact public storefront scope is returned;
-- - caller-controlled tokens are literal-quoted with format(%L);
-- - sort is allow-listed;
-- - limit is clamped to 1..100;
-- - the function is read-only (STABLE) and exposes no mutation path.

create or replace function public.search_public_catalog_products_indexed(
  p_tokens text[],
  p_offset integer default 0,
  p_limit integer default 25,
  p_sort text default 'featured',
  p_buyable boolean default false,
  p_with_image boolean default false
)
returns setof public.catalog_products
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
set row_security = off
as $$
declare
  v_input text;
  v_token text;
  v_tokens text[] := '{}'::text[];
  v_where text := '';
  v_order text;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  -- Keep the database-side contract at least as strict as searchTokens() in the
  -- application. PostgREST callers cannot smuggle wildcard/control fragments.
  foreach v_input in array coalesce(p_tokens, '{}'::text[]) loop
    v_token := btrim(regexp_replace(v_input, '[%_,()]', '', 'g'));
    if v_token <> '' and cardinality(v_tokens) < 6 then
      v_tokens := array_append(v_tokens, v_token);
    end if;
  end loop;

  if cardinality(v_tokens) = 0 then
    return;
  end if;

  -- Preserve the existing public-search semantics: every token must match at
  -- least one of the four searchable fields. Dynamic SQL is intentional here:
  -- literal token predicates let PostgreSQL plan against the pg_trgm indexes
  -- instead of the RLS-barrier sequential scan seen through direct anon SELECT.
  foreach v_token in array v_tokens loop
    v_where := v_where || format(
      ' and (name_ua ilike %L or name ilike %L or supplier_sku ilike %L or category_slug ilike %L)',
      '%' || v_token || '%',
      '%' || v_token || '%',
      '%' || v_token || '%',
      '%' || v_token || '%'
    );
  end loop;

  if p_buyable then
    v_where := v_where || ' and price_uah >= 10 and is_price_suspicious is not true';
  end if;

  if p_with_image then
    v_where := v_where || ' and (main_image_url is not null or images is not null)';
  end if;

  v_order := case p_sort
    when 'price_asc' then 'price_uah asc nulls last, name_ua asc'
    when 'price_desc' then 'price_uah desc nulls last, name_ua asc'
    when 'newest' then 'created_at desc'
    when 'name' then 'name_ua asc'
    else 'is_featured desc, display_order asc, name_ua asc'
  end;

  return query execute format(
    'select * from public.catalog_products
      where status = ''published''
        and (
          source = ''supplier''
          or (source is null and (supplier_sku is not null or supplier_product_id is not null))
          or (source = ''manual'' and lead_type = ''metal'')
        )%s
      order by %s
      limit %s offset %s',
    v_where,
    v_order,
    v_limit,
    v_offset
  );
end;
$$;

revoke all on function public.search_public_catalog_products_indexed(text[], integer, integer, text, boolean, boolean) from public;
grant execute on function public.search_public_catalog_products_indexed(text[], integer, integer, text, boolean, boolean) to anon, authenticated, service_role;

comment on function public.search_public_catalog_products_indexed(text[], integer, integer, text, boolean, boolean)
is 'Bounded read-only public catalog search that enforces published storefront scope while bypassing the catalog_products RLS planner barrier so pg_trgm indexes remain usable.';
