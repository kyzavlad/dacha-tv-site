-- ============================================================================
-- Migration: 20260629_manual_content_tables
-- ============================================================================
-- The new-project rebuild (20260628_rebuild_new_supabase.sql) created the
-- booking + catalog tables but NOT the legacy manual-content tables that the
-- /honey, /flowers and /beekeeper pages (and the content-recovery restore SQL)
-- depend on. This adds them, reconstructed from migrations 001 + 016 (+ the
-- honey price columns from 054). Idempotent and additive — safe to re-run; does
-- not touch any booking/catalog table.
-- ============================================================================

-- ─── honey_products (001 + 054) ──────────────────────────────────────────────
create table if not exists honey_products (
  id                 uuid        primary key default gen_random_uuid(),
  name               text        not null,
  slug               text        not null unique,
  variety            text        not null,
  description        text,
  packaging          text[],
  price_plastic_uah  integer,
  price_glass_uah    integer,
  is_featured        boolean     default false,
  in_stock           boolean     default true,
  display_order      int         default 10,
  image_url          text,
  image_alt          text,
  youtube_video_link text,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);

-- ─── apiary_products (001) ───────────────────────────────────────────────────
create table if not exists apiary_products (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  slug          text        not null unique,
  description   text,
  packaging     text[],
  in_stock      boolean     default true,
  display_order int         default 10,
  image_url     text,
  image_alt     text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─── beekeeper_products (001) ────────────────────────────────────────────────
create table if not exists beekeeper_products (
  id            uuid        primary key default gen_random_uuid(),
  name          text        not null,
  slug          text        not null unique,
  product_type  text        not null,
  description   text,
  breeds        text[],
  season_note   text,
  image_url     text,
  image_alt     text,
  display_order int         default 10,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ─── flower_products (016) ───────────────────────────────────────────────────
create table if not exists flower_products (
  id                uuid          primary key default gen_random_uuid(),
  name              text          not null,
  slug              text          not null unique,
  category          text          not null default 'chrysanthemum',
  variety           text,
  short_description text,
  full_description  text,
  price_uah         numeric(10,2),
  color             text,
  bloom_season      text,
  height_cm         int,
  lighting          text,
  packaging_note    text,
  display_order     int           not null default 10,
  is_featured       boolean       not null default false,
  in_stock          boolean       not null default true,
  image_url         text,
  image_alt         text,
  youtube_video_url text,
  created_at        timestamptz   not null default now(),
  updated_at        timestamptz   not null default now()
);

-- ─── RLS: public read, service role manages (matches the rest of the schema) ──
alter table honey_products     enable row level security;
alter table apiary_products    enable row level security;
alter table beekeeper_products enable row level security;
alter table flower_products    enable row level security;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['honey_products','apiary_products','beekeeper_products','flower_products'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='public_read_'||t) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', 'public_read_'||t, t);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='service_role_all_'||t) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (auth.role() = ''service_role'') WITH CHECK (auth.role() = ''service_role'')', 'service_role_all_'||t, t);
    END IF;
  END LOOP;
END $$;
