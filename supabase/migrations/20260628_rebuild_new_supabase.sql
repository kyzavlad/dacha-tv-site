-- ============================================================================
-- Migration: 20260628_rebuild_new_supabase
-- ============================================================================
-- Full schema rebuild for a NEW Supabase project after the original project
-- became inaccessible (blocked account, lost service-role key). Reconstructed
-- from the codebase and migrations 001–059.
--
-- PRIORITY = booking recovery. SECTION 1 (services, bookings, booking_blocks,
-- inquiries, site_settings, reviews) is everything /lavender booking,
-- /api/bookings/availability and /admin/bookings need. SECTION 2 (catalog) and
-- SECTION 3 (supplier / orders) are created EMPTY so the storefront/admin do not
-- error — their DATA recovery is separate (see scripts/migrate-from-old-supabase.ts).
--
-- Server code talks to Supabase with the SERVICE ROLE key (which BYPASSES RLS),
-- so the booking tables only need a service_role policy. The public anon key is
-- used ONLY for the storefront catalog reads, so catalog_products /
-- catalog_categories also get a published-only public SELECT policy.
--
-- Fully idempotent — safe to paste into the Supabase SQL Editor and re-run.
-- ============================================================================

create extension if not exists pgcrypto;

-- Shared updated_at trigger function (used by several tables below).
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

-- ============================================================================
-- SECTION 1 — BOOKING-CRITICAL (restore lavender booking + admin visibility)
-- ============================================================================

-- ─── services ────────────────────────────────────────────────────────────────
create table if not exists services (
  id                     uuid        primary key default gen_random_uuid(),
  name                   text        not null,
  slug                   text        not null unique,
  short_description      text,
  description            text,
  price_uah              numeric,
  price_note             text,
  duration_note          text,
  status                 text        not null default 'active' check (status in ('active', 'inactive')),
  is_featured            boolean     not null default false,
  display_order          integer     not null default 0,
  image_url              text,
  -- booking columns (migration 042)
  booking_type           text        check (booking_type in ('hourly', 'daily')),
  capacity               int,
  extra_guest_price_uah  int,
  slot_start_hour        int,
  slot_end_hour          int,
  check_in_time          text,
  check_out_time         text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- ─── bookings (042 + 056 + 058 + 059) ────────────────────────────────────────
create table if not exists bookings (
  id                 uuid        primary key default gen_random_uuid(),
  service_id         uuid        references services(id) on delete set null,
  service_slug       text        not null,
  booking_type       text        not null check (booking_type in ('hourly', 'daily')),
  name               text        not null,
  phone              text        not null,
  booking_date       date,
  booking_hour       int,
  check_in           date,
  check_out          date,
  guest_count        int         not null default 1,
  bouquet_qty        int         not null default 0,
  extra_guests_count int         not null default 0,
  duration_hours     int         not null default 1,
  total_price_uah    int,
  comment            text,
  status             text        not null default 'new'
                     check (status in ('new', 'pending', 'confirmed', 'cancelled', 'declined', 'expired', 'completed', 'blocked')),
  admin_notes        text,
  source             text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ─── booking_blocks ──────────────────────────────────────────────────────────
create table if not exists booking_blocks (
  id           uuid        primary key default gen_random_uuid(),
  service_slug text        not null,
  block_date   date        not null,
  block_hour   int,
  reason       text,
  created_at   timestamptz not null default now()
);

-- ─── inquiries (001 + 015 + 044 + 054) ───────────────────────────────────────
create table if not exists inquiries (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  type        text        not null default 'general'
              check (type in ('honey_order', 'beekeeper_inquiry', 'general', 'flower_inquiry', 'lavender_booking', 'water_house_booking')),
  name        text        not null,
  phone       text        not null,
  product     text,
  packaging   text,
  breed       text,
  quantity    text,
  timing      text,
  message     text,
  flower_type text,
  source      text,
  status      text        not null default 'new',
  notes       text
);

-- ─── site_settings (singleton id=1) ──────────────────────────────────────────
create table if not exists site_settings (
  id                         int  primary key default 1,
  phone                      text,
  phone_secondary            text,
  address_full               text,
  address_display            text,
  telegram_url               text,
  youtube_url                text,
  featured_youtube_video_url text,
  instagram_url              text,
  facebook_url               text,
  tiktok_url                 text,
  hero_tagline               text,
  hero_subtext               text,
  updated_at                 timestamptz default now()
);

-- ─── reviews (homepage testimonials) ─────────────────────────────────────────
create table if not exists reviews (
  id            uuid        primary key default gen_random_uuid(),
  reviewer_name text        not null,
  city          text        not null,
  quote         text        not null,
  rating        int         not null check (rating between 1 and 5),
  is_visible    boolean     default false,
  created_at    timestamptz default now()
);

-- ─── updated_at triggers ─────────────────────────────────────────────────────
drop trigger if exists set_services_updated_at on services;
create trigger set_services_updated_at before update on services
  for each row execute procedure set_updated_at();

drop trigger if exists set_bookings_updated_at on bookings;
create trigger set_bookings_updated_at before update on bookings
  for each row execute procedure set_updated_at();

-- ─── indexes for availability / conflict / admin ─────────────────────────────
create index if not exists idx_bookings_service_slug        on bookings (service_slug);
create index if not exists idx_bookings_status              on bookings (status);
create index if not exists idx_bookings_booking_date        on bookings (booking_date);
create index if not exists idx_bookings_booking_hour        on bookings (booking_hour);
create index if not exists idx_bookings_slug_date_status    on bookings (service_slug, booking_date, status);
create index if not exists idx_bookings_created_at          on bookings (created_at desc);
create index if not exists idx_booking_blocks_slug_date     on booking_blocks (service_slug, block_date);
create index if not exists idx_inquiries_status_created     on inquiries (status, created_at desc);
create index if not exists idx_services_slug                on services (slug);

-- ─── RLS (service role bypasses RLS; policies kept explicit + safe) ───────────
alter table services      enable row level security;
alter table bookings      enable row level security;
alter table booking_blocks enable row level security;
alter table inquiries     enable row level security;
alter table site_settings enable row level security;
alter table reviews       enable row level security;

DO $$
BEGIN
  -- services: public can read, service role manages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='services' AND policyname='public_read_services') THEN
    CREATE POLICY "public_read_services" ON services FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='services' AND policyname='service_role_all_services') THEN
    CREATE POLICY "service_role_all_services" ON services FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- bookings: service role only (PII; all app access is server-side service role)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bookings' AND policyname='service_role_all_bookings') THEN
    CREATE POLICY "service_role_all_bookings" ON bookings FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- booking_blocks: service role only (read via service-role availability path)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='booking_blocks' AND policyname='service_role_all_booking_blocks') THEN
    CREATE POLICY "service_role_all_booking_blocks" ON booking_blocks FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- inquiries: service role only
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='inquiries' AND policyname='service_role_all_inquiries') THEN
    CREATE POLICY "service_role_all_inquiries" ON inquiries FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- site_settings: public read, service role manages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='site_settings' AND policyname='public_read_site_settings') THEN
    CREATE POLICY "public_read_site_settings" ON site_settings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='site_settings' AND policyname='service_role_all_site_settings') THEN
    CREATE POLICY "service_role_all_site_settings" ON site_settings FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- reviews: public reads visible rows (app filters is_visible), service role manages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='public_read_reviews') THEN
    CREATE POLICY "public_read_reviews" ON reviews FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='reviews' AND policyname='service_role_all_reviews') THEN
    CREATE POLICY "service_role_all_reviews" ON reviews FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- SECTION 2 — STOREFRONT CATALOG (created EMPTY so the storefront never errors)
-- ============================================================================

-- ─── supplier_products (referenced by catalog_products FK; 037+041+048+052+054)
create table if not exists supplier_products (
  id                      uuid        primary key default gen_random_uuid(),
  supplier_sku            text        not null unique,
  supplier_category_id    text,
  name                    text        not null,
  name_ua                 text,
  slug                    text,
  description             text,
  description_ua          text,
  short_description_ua    text,
  price_uah               numeric,
  our_price_uah           numeric,
  supplier_price_usd      numeric,
  supplier_price_rate     numeric,
  supplier_price_currency text,
  price_win_field         text,
  last_price_synced_at    timestamptz,
  stock_quantity          integer     not null default 0,
  is_in_stock             boolean     not null default false,
  main_image_url          text,
  images                  jsonb,
  attributes              jsonb,
  weight_kg               numeric,
  is_approved             boolean     not null default false,
  is_published            boolean     not null default false,
  publish_priority        integer     not null default 0,
  meta_title              text,
  meta_description        text,
  raw_data                jsonb,
  last_synced_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- ─── supplier_categories (037 + 054) ─────────────────────────────────────────
create table if not exists supplier_categories (
  id                 uuid        primary key default gen_random_uuid(),
  supplier_id        text        not null unique,
  name               text        not null,
  name_ua            text,
  slug               text,
  parent_supplier_id text,
  is_approved        boolean     not null default false,
  display_order      integer     not null default 0,
  raw_data           jsonb,
  synced_at          timestamptz not null default now(),
  created_at         timestamptz not null default now()
);

-- ─── supplier_sync_log (037 + 039) ───────────────────────────────────────────
create table if not exists supplier_sync_log (
  id               uuid        primary key default gen_random_uuid(),
  sync_type        text        not null,
  status           text        not null default 'running'
                   check (status in ('running', 'completed', 'failed', 'stale')),
  products_total   integer     not null default 0,
  products_new     integer     not null default 0,
  products_updated integer     not null default 0,
  products_errors  integer     not null default 0,
  categories_total integer     not null default 0,
  error_details    jsonb,
  triggered_by     text,
  started_at       timestamptz not null default now(),
  completed_at     timestamptz
);

-- ─── catalog_categories (039 + 048 + 051 + 054 + 055) ────────────────────────
create table if not exists catalog_categories (
  id                   uuid        primary key default gen_random_uuid(),
  supplier_category_id text,
  slug                 text        not null unique,
  name                 text,
  name_ua              text        not null,
  description          text,
  description_ua       text,
  h1                   text,
  faq_json             jsonb,
  meta_title           text,
  meta_description     text,
  meta_auto_generated  boolean     not null default false,
  image_url            text,
  is_published         boolean     not null default false,
  display_order        integer     not null default 0,
  sort_order           integer     not null default 100,
  source               text        not null default 'supplier' check (source in ('supplier', 'manual')),
  lead_type            text,
  seo_title            text,
  seo_description      text,
  seo_keywords         text,
  seo_status           text        not null default 'missing',
  seo_source           text        not null default 'none',
  seo_generated_at     timestamptz,
  seo_manual_lock      boolean     not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ─── catalog_products (037 + 048 + 051 + 054 + 055) ──────────────────────────
create table if not exists catalog_products (
  id                  uuid        primary key default gen_random_uuid(),
  supplier_product_id uuid        references supplier_products(id) on delete set null,
  supplier_sku        text        unique,
  name                text,
  name_ua             text        not null,
  slug                text        not null unique,
  category_slug       text,
  short_description   text,
  description         text,
  description_ua      text,
  price_uah           numeric,
  compare_price_uah   numeric,
  price_prefix        text,
  unit_label          text,
  main_image_url      text,
  images              jsonb,
  attributes          jsonb,
  options             jsonb,
  status              text        not null default 'draft' check (status in ('published', 'draft', 'archived')),
  is_featured         boolean     not null default false,
  display_order       integer     not null default 0,
  sort_order          integer     not null default 100,
  product_group       text        not null default 'catalog',
  source              text        not null default 'supplier' check (source in ('supplier', 'manual')),
  inquiry_only        boolean     not null default false,
  lead_type           text,
  is_price_suspicious boolean     not null default false,
  meta_title          text,
  meta_description    text,
  seo_keywords        text,
  seo_status          text        not null default 'missing',
  seo_source          text        not null default 'none',
  seo_generated_at    timestamptz,
  seo_manual_lock     boolean     not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- catalog indexes
create index if not exists idx_catalog_products_status        on catalog_products(status) where status = 'published';
create index if not exists idx_catalog_products_slug          on catalog_products(slug);
create index if not exists idx_catalog_products_category_slug on catalog_products(category_slug) where category_slug is not null;
create index if not exists idx_catalog_categories_slug        on catalog_categories(slug);
create index if not exists idx_catalog_categories_published   on catalog_categories(is_published) where is_published = true;
create index if not exists idx_supplier_products_sku          on supplier_products(supplier_sku);

drop trigger if exists set_catalog_products_updated_at on catalog_products;
create trigger set_catalog_products_updated_at before update on catalog_products
  for each row execute procedure set_updated_at();

drop trigger if exists set_catalog_categories_updated_at on catalog_categories;
create trigger set_catalog_categories_updated_at before update on catalog_categories
  for each row execute procedure set_updated_at();

-- ============================================================================
-- SECTION 3 — ORDERS (created EMPTY; checkout/admin compatibility, 045 + 052)
-- ============================================================================
create table if not exists orders (
  id                         uuid          primary key default gen_random_uuid(),
  created_at                 timestamptz   default now(),
  customer_name              text          not null,
  phone                      text          not null,
  comment                    text,
  delivery_notes             text,
  status                     text          not null default 'new'
                             check (status in ('new', 'confirmed', 'packed', 'shipped', 'completed', 'cancelled')),
  total_uah                  numeric(10,2) not null default 0,
  source                     text,
  order_source               text          not null default 'website' check (order_source in ('website', 'admin')),
  admin_notes                text,
  receiver_first_name        text,
  receiver_last_name         text,
  receiver_patronymic        text,
  method_payment             text,
  nova_poshta_warehouse_id   text,
  nova_poshta_warehouse_name text,
  supplier_order_id          text,
  supplier_order_mode        text,
  supplier_order_status      text,
  supplier_order_response    jsonb
);

create table if not exists order_items (
  id             uuid          primary key default gen_random_uuid(),
  order_id       uuid          not null references orders(id) on delete cascade,
  product_type   text          not null check (product_type in ('catalog', 'apiary', 'flower', 'honey', 'custom')),
  product_id     text,
  product_slug   text          not null,
  product_name   text          not null,
  unit_price_uah numeric(10,2) not null,
  quantity       integer       not null default 1 check (quantity > 0),
  subtotal_uah   numeric(10,2) not null,
  variant        text
);

create index if not exists orders_status_created on orders(status, created_at desc);
create index if not exists order_items_order_id  on order_items(order_id);

-- ─── RLS for catalog / supplier / orders ─────────────────────────────────────
alter table supplier_products   enable row level security;
alter table supplier_categories enable row level security;
alter table supplier_sync_log   enable row level security;
alter table catalog_categories  enable row level security;
alter table catalog_products    enable row level security;
alter table orders              enable row level security;
alter table order_items         enable row level security;

DO $$
BEGIN
  -- supplier_* + sync log: service role only
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_products' AND policyname='service_role_all_supplier_products') THEN
    CREATE POLICY "service_role_all_supplier_products" ON supplier_products FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_categories' AND policyname='service_role_all_supplier_categories') THEN
    CREATE POLICY "service_role_all_supplier_categories" ON supplier_categories FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_sync_log' AND policyname='service_role_all_supplier_sync_log') THEN
    CREATE POLICY "service_role_all_supplier_sync_log" ON supplier_sync_log FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- catalog: public reads published rows (anon storefront), service role manages
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='catalog_categories' AND policyname='public_read_catalog_categories') THEN
    CREATE POLICY "public_read_catalog_categories" ON catalog_categories FOR SELECT USING (is_published = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='catalog_categories' AND policyname='service_role_all_catalog_categories') THEN
    CREATE POLICY "service_role_all_catalog_categories" ON catalog_categories FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='catalog_products' AND policyname='public_read_published_catalog_products') THEN
    CREATE POLICY "public_read_published_catalog_products" ON catalog_products FOR SELECT USING (status = 'published');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='catalog_products' AND policyname='service_role_all_catalog_products') THEN
    CREATE POLICY "service_role_all_catalog_products" ON catalog_products FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;

  -- orders / order_items: service role manages; public may insert (checkout)
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders' AND policyname='service_role_all_orders') THEN
    CREATE POLICY "service_role_all_orders" ON orders FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders' AND policyname='public_insert_orders') THEN
    CREATE POLICY "public_insert_orders" ON orders FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='order_items' AND policyname='service_role_all_order_items') THEN
    CREATE POLICY "service_role_all_order_items" ON order_items FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='order_items' AND policyname='public_insert_order_items') THEN
    CREATE POLICY "public_insert_order_items" ON order_items FOR INSERT WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- SECTION 4 — SEED: minimum data so lavender booking works immediately
-- ============================================================================

-- Singleton settings row so /admin settings has something to edit. No business
-- values seeded here — the app falls back to its launch-default constants.
insert into site_settings (id) values (1) on conflict (id) do nothing;

-- Lavender field rental — the slug MUST stay 'orenda-lavandovoho-polia' because
-- the availability API maps ?type=lavender → this slug, and the code reads these
-- pricing/hours fields. Two-tier price (06:00–15:00 = 1000 ₴, 15:00–21:00 =
-- 1200 ₴) is applied in app code; price_uah holds the base/day rate.
insert into services (
  name, slug, short_description, description,
  price_uah, price_note, duration_note,
  status, is_featured, display_order,
  booking_type, capacity, extra_guest_price_uah, slot_start_hour, slot_end_hour
) values (
  'Оренда лавандового поля',
  'orenda-lavandovoho-polia',
  'Фотосесії, освітні, культурні й оздоровчі заходи на лавандовому полі — погодинна оренда 06:00–21:00.',
  'Орендуйте лавандове поле на нашій садибі для фотосесій, освітніх, культурних і оздоровчих заходів. Вартість включає 5 осіб, кожна додаткова — 200 ₴. Сезон цвітіння: червень–липень.',
  1000, '06:00–15:00 — 1000 ₴/год · 15:00–21:00 — 1200 ₴/год', 'Погодинно з 06:00 до 21:00',
  'active', true, 1,
  'hourly', 5, 200, 6, 21
)
on conflict (slug) do update set
  name                  = excluded.name,
  short_description     = excluded.short_description,
  description           = excluded.description,
  booking_type          = excluded.booking_type,
  capacity              = excluded.capacity,
  extra_guest_price_uah = excluded.extra_guest_price_uah,
  slot_start_hour       = excluded.slot_start_hour,
  slot_end_hour         = excluded.slot_end_hour,
  price_uah             = excluded.price_uah,
  price_note            = excluded.price_note,
  duration_note         = excluded.duration_note,
  status                = 'active';

-- Water-house daily rental — the second bookable service (daily). Optional for
-- lavender, but keeps /services and daily booking working.
insert into services (
  name, slug, short_description, description,
  price_uah, price_note, duration_note,
  status, is_featured, display_order,
  booking_type, capacity, check_in_time, check_out_time
) values (
  'Оренда будиночка на воді',
  'orenda-budynochka-na-vodi',
  'Затишний будиночок над ставком — для відпочинку або сімейного свята. Заїзд о 12:00.',
  'Будиночок на воді — місце для відпочинку над тихим ставком. Вміщує до 10 осіб. Заїзд о 12:00, виїзд о 12:00 наступного дня. Оренда від 1 доби.',
  3000, '₴3000 / доба', 'Від 1 доби',
  'active', true, 2,
  'daily', 10, '12:00', '12:00'
)
on conflict (slug) do update set
  booking_type   = excluded.booking_type,
  capacity       = excluded.capacity,
  check_in_time  = excluded.check_in_time,
  check_out_time = excluded.check_out_time,
  price_uah      = excluded.price_uah,
  status         = 'active';

-- ============================================================================
-- Done. Run supabase/verify-rebuild.sql next to smoke-test the booking path.
-- ============================================================================
