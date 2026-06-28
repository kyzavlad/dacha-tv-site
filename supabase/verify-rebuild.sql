-- ============================================================================
-- verify-rebuild.sql — manual smoke test for the rebuilt Supabase project
-- ============================================================================
-- Run AFTER 20260628_rebuild_new_supabase.sql, in the Supabase SQL Editor.
-- It is NOT a migration (lives outside supabase/migrations/) so it never runs
-- automatically. It inserts ONE test booking and then cleans it up at the end.
-- ============================================================================

-- 1) Tables exist and the lavender service is seeded -------------------------
select count(*) as services_count from services;
select count(*) as bookings_count from bookings;
select slug, booking_type, price_uah, capacity, slot_start_hour, slot_end_hour, status
  from services where slug = 'orenda-lavandovoho-polia';

-- 2) Insert one TEST lavender booking ---------------------------------------
-- 2026-06-28 (lavender season) at 10:00 for 2 hours. Marker phone for cleanup.
insert into bookings (
  service_slug, booking_type, name, phone,
  booking_date, booking_hour, duration_hours,
  check_in, check_out,
  guest_count, total_price_uah, status, source
) values (
  'orenda-lavandovoho-polia', 'hourly', 'TEST Перевірка', '+380000000000',
  '2026-06-28', 10, 2,
  '2026-06-28T10:00:00Z', '2026-06-28T12:00:00Z',
  3, 2000, 'new', 'verify-rebuild'
);

-- 3) Admin-compatible shape (matches getAllBookings select *) ----------------
select id, service_slug, name, phone, booking_date, booking_hour, duration_hours,
       guest_count, total_price_uah, status, created_at
  from bookings
 where source = 'verify-rebuild'
 order by created_at desc
 limit 5;

-- 4) Availability detects the booked hours ----------------------------------
-- Mirrors /api/bookings/availability: active statuses (new/pending/confirmed)
-- on the date. Expect hours 10 and 11 to appear as occupied.
select booking_hour, duration_hours
  from bookings
 where service_slug = 'orenda-lavandovoho-polia'
   and booking_date = '2026-06-28'
   and status in ('new', 'pending', 'confirmed');

-- 5) Cleanup the test row ----------------------------------------------------
delete from bookings where source = 'verify-rebuild' and phone = '+380000000000';

-- Confirm cleanup
select count(*) as remaining_test_rows
  from bookings where source = 'verify-rebuild';
