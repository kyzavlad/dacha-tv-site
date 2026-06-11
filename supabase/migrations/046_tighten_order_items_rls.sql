-- Migration 046: Tighten order_items INSERT policy.
-- Replaces the open "with check (true)" policy so anonymous inserts
-- can only attach items to orders that are still in 'new' status.
-- Checkout always creates the order first (status='new'), then immediately
-- inserts items — this window is safe. Confirmed/shipped orders cannot
-- receive new items from the public.
-- Idempotent — safe to re-run.

drop policy if exists "public_insert_order_items" on order_items;

create policy "public_insert_order_items"
  on order_items for insert
  with check (
    exists (
      select 1 from orders
      where orders.id  = order_items.order_id
        and orders.status = 'new'
    )
  );
