-- Migration 039: Catalog categories + minor fixes
-- Adds public-facing catalog_categories table (separate from raw supplier_categories).
-- Fixes supplier_sync_log to allow 'stale' status (used by sync code).
-- Idempotent — safe to re-run.

-- ─── Catalog categories ────────────────────────────────────────────────────────
-- Admin curates these manually from supplier_categories.
-- Nothing visible publicly until is_published = true.

create table if not exists catalog_categories (
  id                   uuid        primary key default gen_random_uuid(),
  supplier_category_id text,                    -- matches supplier_categories.supplier_id
  slug                 text        not null unique,
  name_ua              text        not null,
  description          text,
  meta_title           text,
  meta_description     text,
  image_url            text,
  is_published         boolean     not null default false,
  display_order        integer     not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_catalog_categories_slug
  on catalog_categories(slug);
create index if not exists idx_catalog_categories_published
  on catalog_categories(is_published) where is_published = true;

-- ─── RLS for catalog_categories ───────────────────────────────────────────────

alter table catalog_categories enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'catalog_categories' and policyname = 'public_read_catalog_categories'
  ) then
    create policy "public_read_catalog_categories"
      on catalog_categories for select using (is_published = true);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'catalog_categories' and policyname = 'service_role_all_catalog_categories'
  ) then
    create policy "service_role_all_catalog_categories"
      on catalog_categories for all using (auth.role() = 'service_role');
  end if;
end $$;

-- ─── Allow 'stale' in sync log ────────────────────────────────────────────────
-- Our sync code marks stuck runs as 'stale'. Update the CHECK constraint.

alter table supplier_sync_log
  drop constraint if exists supplier_sync_log_status_check;

alter table supplier_sync_log
  add constraint supplier_sync_log_status_check
  check (status in ('running', 'completed', 'failed', 'stale'));

-- ─── Add category_slug index on catalog_products ──────────────────────────────

create index if not exists idx_catalog_products_category_slug
  on catalog_products(category_slug) where category_slug is not null;
