-- ============================================================================
-- Migration: 20260720_catalog_manual_ownership_and_sync_state
-- ============================================================================
-- Two additive, idempotent changes. No data rewrite. Safe to re-run.
--
-- 1. Explicit per-field manual ownership locks on catalog_products.
--    The storefront layer (catalog_products) is edited by hand in the admin,
--    while the supplier import (`syncProductsToCatalog`) refreshes operational
--    facts. Today the import UPDATE path unconditionally overwrites price_uah,
--    main_image_url and images — which silently clobbers a manual image or a
--    manually-set storefront price. These explicit boolean locks let the import
--    skip exactly those columns when a human has taken ownership, WITHOUT relying
--    on null-value heuristics. `source = 'manual'` already exists and marks fully
--    hand-owned rows (metal-profile, manual natural products); the import must
--    never touch those rows at all.
--
--    (SEO fields already have `seo_manual_lock`, and the import never writes
--     name/description/category/SEO/featured/order, so those stay protected as-is.)
--
-- 2. supplier_sync_state — durable, resumable cursor for the daily feed sync.
--    supplier_sync_log is an append-only run history and has no place to persist
--    "resume from offset N of the current cycle" across scheduled invocations.
--    This one-row-per-sync_type table stores the cycle cursor so each daily cron
--    fire resumes where the last one stopped instead of always restarting at 0.
-- ============================================================================

-- ── 0. Shared updated_at trigger fn (self-contained + idempotent) ────────────
-- The rebuild migration defines set_updated_at(), but this migration must be
-- safe to apply even if that function is somehow absent, so we (re)create it.
-- CREATE OR REPLACE is non-destructive and re-runnable.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ── 1. Manual ownership locks ────────────────────────────────────────────────
alter table catalog_products add column if not exists price_manual_lock boolean not null default false;
alter table catalog_products add column if not exists image_manual_lock boolean not null default false;

comment on column catalog_products.price_manual_lock is
  'When true, supplier import must NOT overwrite price_uah/compare_price_uah (manual storefront price).';
comment on column catalog_products.image_manual_lock is
  'When true, supplier import must NOT overwrite main_image_url/images (manual storefront imagery).';

-- Marks a category short intro (description) as a deterministic generated
-- fallback, so a later legacy restore is allowed to replace it (a generated
-- fallback must never block real legacy content).
alter table catalog_categories add column if not exists description_auto_generated boolean not null default false;

comment on column catalog_categories.description_auto_generated is
  'True when catalog_categories.description was filled by the deterministic name-based fallback. Legacy restore may overwrite these; hand-written/legacy descriptions set it false.';

-- ── 2. supplier_sync_state (resumable feed cursor) ───────────────────────────
create table if not exists supplier_sync_state (
  sync_type      text        primary key,        -- e.g. 'products'
  cycle_id       uuid        not null default gen_random_uuid(),
  status         text        not null default 'idle'
                 check (status in ('idle', 'running', 'completed', 'failed')),
  feed_total     integer     not null default 0,  -- rows in the supplier feed at cycle start
  processed      integer     not null default 0,  -- rows processed so far this cycle
  inserted       integer     not null default 0,  -- cumulative this cycle
  updated        integer     not null default 0,  -- cumulative this cycle
  errors         integer     not null default 0,  -- cumulative this cycle
  current_offset integer     not null default 0,  -- offset the last invocation started at
  next_offset    integer,                          -- where the next invocation resumes (null = cycle done)
  started_at     timestamptz,                      -- current cycle start
  completed_at   timestamptz,                      -- last completed cycle finish
  updated_at     timestamptz not null default now()
);

comment on table supplier_sync_state is
  'One row per sync_type. Durable resume cursor for the daily supplier feed sync so each scheduled run continues the current cycle instead of restarting at offset 0.';

-- keep updated_at fresh (reuse the shared trigger fn created by the rebuild)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'set_supplier_sync_state_updated_at') THEN
    CREATE TRIGGER set_supplier_sync_state_updated_at
      BEFORE UPDATE ON supplier_sync_state
      FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
  END IF;
END $$;

-- Service-role only (mirrors supplier_sync_log). Anon storefront never reads it.
alter table supplier_sync_state enable row level security;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='supplier_sync_state' AND policyname='service_role_all_supplier_sync_state') THEN
    CREATE POLICY "service_role_all_supplier_sync_state" ON supplier_sync_state
      FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
