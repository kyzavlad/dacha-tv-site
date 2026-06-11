-- Migration 045: Store core — orders and order_items tables.
-- Idempotent — safe to re-run.

create table if not exists orders (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz default now(),
  customer_name   text        not null,
  phone           text        not null,
  comment         text,
  delivery_notes  text,
  status          text        not null default 'new'
                  check (status in ('new','confirmed','packed','shipped','completed','cancelled')),
  total_uah       numeric(10,2) not null default 0,
  source          text,
  order_source    text        not null default 'website'
                  check (order_source in ('website','admin')),
  admin_notes     text
);

create table if not exists order_items (
  id              uuid        primary key default gen_random_uuid(),
  order_id        uuid        not null references orders(id) on delete cascade,
  product_type    text        not null
                  check (product_type in ('catalog','apiary','flower','honey','custom')),
  product_id      text,
  product_slug    text        not null,
  product_name    text        not null,
  unit_price_uah  numeric(10,2) not null,
  quantity        integer     not null default 1 check (quantity > 0),
  subtotal_uah    numeric(10,2) not null,
  variant         text
);

create index if not exists orders_status_created on orders(status, created_at desc);
create index if not exists order_items_order_id  on order_items(order_id);

-- RLS
alter table orders      enable row level security;
alter table order_items enable row level security;

-- Policies — idempotent + valid syntax (CREATE POLICY has no IF NOT EXISTS).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='orders') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders' AND policyname='service_role_all_orders') THEN
      CREATE POLICY "service_role_all_orders" ON orders FOR ALL USING (auth.role() = 'service_role');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orders' AND policyname='public_insert_orders') THEN
      CREATE POLICY "public_insert_orders" ON orders FOR INSERT WITH CHECK (true);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='order_items') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='order_items' AND policyname='service_role_all_order_items') THEN
      CREATE POLICY "service_role_all_order_items" ON order_items FOR ALL USING (auth.role() = 'service_role');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='order_items' AND policyname='public_insert_order_items') THEN
      CREATE POLICY "public_insert_order_items" ON order_items FOR INSERT WITH CHECK (true);
    END IF;
  END IF;
END $$;
