-- Migration 059: expand the booking status set.
--
-- The booking flow needs admin statuses beyond the original five. Availability
-- blocks ACTIVE statuses (new / pending / confirmed) and RELEASES the rest
-- (declined / cancelled / expired / completed). This migration only widens the
-- CHECK constraint; all existing rows already use valid values, so nothing is
-- broken and no backfill is required.
--
-- Idempotent — safe to re-run.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'bookings'
  ) THEN
    ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_status_check
      CHECK (status IN ('new', 'pending', 'confirmed', 'cancelled', 'declined', 'expired', 'completed', 'blocked'));
  END IF;
END $$;
