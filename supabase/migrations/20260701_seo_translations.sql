-- ─── Localized SEO translation tables (RU, extensible to any locale) ──────────
-- Russian (and future) SEO lives in dedicated per-locale rows so the Ukrainian
-- columns on catalog_products / catalog_categories are NEVER touched. One row per
-- (entity, locale). Mirrors the Ukrainian SEO column conventions (meta_title,
-- meta_description, description, seo_keywords, h1/faq for categories, plus
-- seo_status/seo_source/seo_manual_lock/seo_generated_at provenance).
--
-- Idempotent: safe to run whether the tables already exist or not. Additive only
-- — it never drops or alters existing data.

-- ── Product translations ──────────────────────────────────────────────────────
create table if not exists catalog_product_translations (
  id               uuid        primary key default gen_random_uuid(),
  product_id       uuid        not null references catalog_products(id) on delete cascade,
  locale           text        not null,
  meta_title       text,
  meta_description text,
  description      text,
  seo_keywords     text,
  seo_status       text        not null default 'missing',
  seo_source       text        not null default 'none',
  seo_manual_lock  boolean     not null default false,
  seo_generated_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (product_id, locale)
);

-- Add-if-missing so a pre-existing table gains any columns it lacks.
alter table catalog_product_translations
  add column if not exists meta_title       text,
  add column if not exists meta_description text,
  add column if not exists description      text,
  add column if not exists seo_keywords     text,
  add column if not exists seo_status       text    not null default 'missing',
  add column if not exists seo_source       text    not null default 'none',
  add column if not exists seo_manual_lock  boolean not null default false,
  add column if not exists seo_generated_at timestamptz;

create index if not exists idx_product_translations_locale       on catalog_product_translations(locale);
create index if not exists idx_product_translations_product      on catalog_product_translations(product_id);
create index if not exists idx_product_translations_seo_status   on catalog_product_translations(locale, seo_status);

-- ── Category translations ─────────────────────────────────────────────────────
create table if not exists catalog_category_translations (
  id               uuid        primary key default gen_random_uuid(),
  category_id      uuid        not null references catalog_categories(id) on delete cascade,
  locale           text        not null,
  meta_title       text,
  meta_description text,
  description      text,
  h1               text,
  seo_keywords     text,
  faq_json         jsonb,
  seo_status       text        not null default 'missing',
  seo_source       text        not null default 'none',
  seo_manual_lock  boolean     not null default false,
  seo_generated_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (category_id, locale)
);

alter table catalog_category_translations
  add column if not exists meta_title       text,
  add column if not exists meta_description text,
  add column if not exists description      text,
  add column if not exists h1               text,
  add column if not exists seo_keywords     text,
  add column if not exists faq_json         jsonb,
  add column if not exists seo_status       text    not null default 'missing',
  add column if not exists seo_source       text    not null default 'none',
  add column if not exists seo_manual_lock  boolean not null default false,
  add column if not exists seo_generated_at timestamptz;

create index if not exists idx_category_translations_locale     on catalog_category_translations(locale);
create index if not exists idx_category_translations_category   on catalog_category_translations(category_id);
create index if not exists idx_category_translations_seo_status on catalog_category_translations(locale, seo_status);

-- ── updated_at triggers (set_updated_at() defined in the base rebuild migration) ─
drop trigger if exists set_product_translations_updated_at on catalog_product_translations;
create trigger set_product_translations_updated_at before update on catalog_product_translations
  for each row execute procedure set_updated_at();

drop trigger if exists set_category_translations_updated_at on catalog_category_translations;
create trigger set_category_translations_updated_at before update on catalog_category_translations
  for each row execute procedure set_updated_at();

-- ── RLS: service role only (same contract as the rest of the catalog) ─────────
alter table catalog_product_translations  enable row level security;
alter table catalog_category_translations enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='catalog_product_translations' AND policyname='service_role_all_product_translations') THEN
    CREATE POLICY "service_role_all_product_translations" ON catalog_product_translations FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='catalog_category_translations' AND policyname='service_role_all_category_translations') THEN
    CREATE POLICY "service_role_all_category_translations" ON catalog_category_translations FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
