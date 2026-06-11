-- Migration 044: Extend inquiries.type CHECK constraint to include flower_inquiry.
-- Also ensures type column exists with a full constraint covering all current inquiry types.
-- Idempotent — safe to re-run.

-- Step 1: Add type column if it was never added (original table had no type column).
ALTER TABLE inquiries
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'general';

-- Step 2: Drop the old CHECK constraint (created by the manual setup SQL in lib/supabase/client.ts
-- which only listed honey_order, beekeeper_inquiry, general).
-- pg_constraint lookup is idempotent — no error if constraint doesn't exist.
DO $$
DECLARE
  c text;
BEGIN
  SELECT conname INTO c
  FROM pg_constraint
  WHERE conrelid = 'inquiries'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%type%';

  IF c IS NOT NULL THEN
    EXECUTE 'ALTER TABLE inquiries DROP CONSTRAINT ' || quote_ident(c);
  END IF;
END $$;

-- Step 3: Add the updated CHECK constraint that includes all inquiry types.
ALTER TABLE inquiries
  ADD CONSTRAINT inquiries_type_check
  CHECK (type IN (
    'honey_order',
    'beekeeper_inquiry',
    'general',
    'flower_inquiry',
    'lavender_booking',
    'water_house_booking'
  ));
