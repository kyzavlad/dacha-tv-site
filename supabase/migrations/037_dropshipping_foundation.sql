-- Migration 037: Dropshipping foundation
-- Raw supplier layer (full catalog ingestion allowed, publishing controlled separately).
-- Completely separate from dacha-tv own catalog (honey, apiary, beekeeper, flowers, services).
-- Idempotent — safe to re-run.

-- ─── Raw supplier categories ───────────────────────────────────────────────

create table if not exists supplier_categories (
  id                 uuid        primary key default gen_random_uuid(),
  supplier_id        text        not null,
  name               text        not null,
  name_ua            text,
  slug               text,
  parent_supplier_id text,
  is_approved        boolean     not null default false,
  display_order      integer     not null default 0,
  raw_data           jsonb,
  synced_at          timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  unique (supplier_id)
);

-- ─── Raw supplier products ─────────────────────────────────────────────────

create table if not exists supplier_products (
  id                    uuid        primary key default gen_random_uuid(),
  supplier_sku          text        not null unique,
  supplier_category_id  text,
  name                  text        not null,
  name_ua               text,
  slug                  text,
  description           text,
  description_ua        text,
  short_description_ua  text,
  price_uah             numeric,
  our_price_uah         numeric,
  stock_quantity        integer     not null default 0,
  is_in_stock           boolean     not null default false,
  main_image_url        text,
  images                jsonb,
  attributes            jsonb,
  weight_kg             numeric,
  -- approval/publish state (admin controls)
  is_approved           boolean     not null default false,
  is_published          boolean     not null default false,
  publish_priority      integer     not null default 0,
  -- seo
  meta_title            text,
  meta_description      text,
  -- sync tracking
  raw_data              jsonb,
  last_synced_at        timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─── Curated public catalog ────────────────────────────────────────────────
-- Denormalized approved subset. Nothing in this table is visible publicly
-- until status = 'published'. Start empty; admin promotes items here.

create table if not exists catalog_products (
  id                   uuid        primary key default gen_random_uuid(),
  supplier_product_id  uuid        references supplier_products(id) on delete set null,
  supplier_sku         text        not null unique,
  name_ua              text        not null,
  slug                 text        not null unique,
  category_slug        text,
  short_description    text,
  description          text,
  price_uah            numeric     not null,
  compare_price_uah    numeric,
  main_image_url       text,
  images               jsonb,
  attributes           jsonb,
  status               text        not null default 'draft'
                       check (status in ('published', 'draft', 'archived')),
  is_featured          boolean     not null default false,
  display_order        integer     not null default 0,
  meta_title           text,
  meta_description     text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ─── Sync audit log ────────────────────────────────────────────────────────

create table if not exists supplier_sync_log (
  id                uuid        primary key default gen_random_uuid(),
  sync_type         text        not null,
  status            text        not null default 'running'
                    check (status in ('running', 'completed', 'failed')),
  products_total    integer     not null default 0,
  products_new      integer     not null default 0,
  products_updated  integer     not null default 0,
  products_errors   integer     not null default 0,
  categories_total  integer     not null default 0,
  error_details     jsonb,
  triggered_by      text,
  started_at        timestamptz not null default now(),
  completed_at      timestamptz
);

-- ─── Indexes ───────────────────────────────────────────────────────────────

create index if not exists idx_supplier_products_sku      on supplier_products(supplier_sku);
create index if not exists idx_supplier_products_category on supplier_products(supplier_category_id);
create index if not exists idx_supplier_products_approved on supplier_products(is_approved) where is_approved = true;
create index if not exists idx_supplier_products_stock    on supplier_products(is_in_stock) where is_in_stock = true;
create index if not exists idx_catalog_products_status    on catalog_products(status) where status = 'published';
create index if not exists idx_catalog_products_slug      on catalog_products(slug);
