-- Supplier order forwarding fields for the orders table.
-- These are used when a catalog-product order is forwarded to the dropship supplier API.
-- All fields are nullable — only catalog orders that were forwarded will have values.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS receiver_first_name      text,
  ADD COLUMN IF NOT EXISTS receiver_last_name       text,
  ADD COLUMN IF NOT EXISTS receiver_patronymic      text,
  ADD COLUMN IF NOT EXISTS method_payment           text,        -- cashondelivery | prepayment
  ADD COLUMN IF NOT EXISTS nova_poshta_warehouse_id text,        -- internal_id from get_novaposhta_warehouses
  ADD COLUMN IF NOT EXISTS nova_poshta_warehouse_name text,
  ADD COLUMN IF NOT EXISTS supplier_order_id        text,        -- id returned by supplier add_order
  ADD COLUMN IF NOT EXISTS supplier_order_mode      text,        -- test | live
  ADD COLUMN IF NOT EXISTS supplier_order_status    text,        -- ok | error | skipped
  ADD COLUMN IF NOT EXISTS supplier_order_response  jsonb;       -- raw supplier API response
