-- Migration 056: Booking options — persist lavender bouquet quantity, and
-- refresh the lavender service price note to reflect the two-tier hourly rate
-- (06:00–15:00 = 1000 ₴, 15:00–21:00 = 1200 ₴).
--
-- Idempotent — safe to re-run.

-- ─── Persist the selected lavender bouquet count on each booking ──────────────
ALTER TABLE IF EXISTS bookings
  ADD COLUMN IF NOT EXISTS bouquet_qty int NOT NULL DEFAULT 0;

-- ─── Two-tier lavender pricing copy ──────────────────────────────────────────
-- price_uah stays the base (day) rate of 1000; the evening surcharge to 1200 is
-- applied in application code by booking hour. We only refresh display copy here.
UPDATE services
   SET price_note    = '06:00–15:00 — 1000 ₴/год · 15:00–21:00 — 1200 ₴/год',
       duration_note = 'Погодинно з 06:00 до 21:00'
 WHERE slug = 'orenda-lavandovoho-polia';
