-- site_settings (singleton — always one row with id=1)
create table if not exists site_settings (
  id int primary key default 1,
  phone text,
  address_full text,
  address_display text,
  telegram_url text,
  youtube_url text,
  instagram_url text,
  facebook_url text,
  tiktok_url text,
  hero_tagline text,
  hero_subtext text,
  updated_at timestamptz default now()
);

-- honey_products
create table if not exists honey_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  variety text not null,
  description text,
  packaging text[],
  is_featured boolean default false,
  in_stock boolean default true,
  display_order int default 10,
  image_url text,
  image_alt text,
  youtube_video_link text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- apiary_products
create table if not exists apiary_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  packaging text[],
  in_stock boolean default true,
  display_order int default 10,
  image_url text,
  image_alt text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- beekeeper_products
create table if not exists beekeeper_products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  product_type text not null,
  description text,
  breeds text[],
  season_note text,
  image_url text,
  image_alt text,
  display_order int default 10,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- reviews
create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_name text not null,
  city text not null,
  quote text not null,
  rating int not null check (rating between 1 and 5),
  is_visible boolean default false,
  created_at timestamptz default now()
);

-- faq_items
create table if not exists faq_items (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null,
  display_order int default 10,
  created_at timestamptz default now()
);

-- inquiries already exists — skip if creating
create table if not exists inquiries (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  name text not null,
  phone text not null,
  product text,
  message text,
  source text,
  status text default 'new'
);

-- RLS: enable for all tables, allow service_role full access
alter table site_settings enable row level security;
alter table honey_products enable row level security;
alter table apiary_products enable row level security;
alter table beekeeper_products enable row level security;
alter table reviews enable row level security;
alter table faq_items enable row level security;
alter table inquiries enable row level security;

-- Policies — idempotent + valid syntax (PostgreSQL has no CREATE POLICY IF NOT
-- EXISTS). Each policy is created only when its table exists and the policy is
-- absent, via EXECUTE format() inside a guarded DO block.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['site_settings','honey_products','apiary_products','beekeeper_products','reviews','faq_items'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
       AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='public_read_'||t) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (true)', 'public_read_'||t, t);
    END IF;
  END LOOP;

  FOREACH t IN ARRAY ARRAY['site_settings','honey_products','apiary_products','beekeeper_products','reviews','faq_items','inquiries'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t)
       AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='service_role_all_'||t) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR ALL USING (auth.role() = ''service_role'')', 'service_role_all_'||t, t);
    END IF;
  END LOOP;
END $$;
