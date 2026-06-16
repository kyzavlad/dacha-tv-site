-- Migration 058: Structured booking extras.
--
-- Adds explicit columns so extra-guest and duration data are no longer hidden in
-- free-text comments, and so the server can recalculate/store the price parts:
--   * extra_guests_count — additional people above the included capacity (×200 ₴)
--   * duration_hours      — number of hours an hourly booking occupies
--
-- bouquet_qty already exists (migration 056). Defaults keep existing rows valid
-- (0 extra guests, 1 hour), so this is fully backward-compatible.
--
-- Idempotent — safe to re-run.

ALTER TABLE IF EXISTS bookings
  ADD COLUMN IF NOT EXISTS extra_guests_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_hours     int NOT NULL DEFAULT 1;

-- Helpful for availability/conflict lookups on confirmed hourly bookings.
CREATE INDEX IF NOT EXISTS idx_bookings_slug_date_status
  ON bookings (service_slug, booking_date, status);
