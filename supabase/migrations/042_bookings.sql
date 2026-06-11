-- Migration 042: Booking system
-- Adds booking columns to services, creates bookings and booking_blocks tables.
-- Seeds lavender-field and water-house services, and a lavender seedlings flower product.
-- Idempotent — safe to re-run.

-- ─── Extend services table ────────────────────────────────────────────────────

alter table services
  add column if not exists booking_type text check (booking_type in ('hourly', 'daily')),
  add column if not exists capacity int,
  add column if not exists extra_guest_price_uah int,
  add column if not exists slot_start_hour int,
  add column if not exists slot_end_hour int,
  add column if not exists check_in_time text,
  add column if not exists check_out_time text;

-- ─── Bookings table ───────────────────────────────────────────────────────────

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references services(id) on delete set null,
  service_slug text not null,
  booking_type text not null check (booking_type in ('hourly', 'daily')),
  name text not null,
  phone text not null,
  booking_date date,
  booking_hour int,
  check_in date,
  check_out date,
  guest_count int not null default 1,
  total_price_uah int,
  comment text,
  status text not null default 'new' check (status in ('new', 'confirmed', 'cancelled', 'completed', 'blocked')),
  admin_notes text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─── Booking blocks table ─────────────────────────────────────────────────────

create table if not exists booking_blocks (
  id uuid primary key default gen_random_uuid(),
  service_slug text not null,
  block_date date not null,
  block_hour int,
  reason text,
  created_at timestamptz not null default now()
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table bookings enable row level security;
alter table booking_blocks enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='bookings' and policyname='service_role_all_bookings') then
    create policy "service_role_all_bookings" on bookings for all using (true) with check (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='booking_blocks' and policyname='service_role_all_booking_blocks') then
    create policy "service_role_all_booking_blocks" on booking_blocks for all using (true) with check (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='bookings' and policyname='anon_insert_bookings') then
    create policy "anon_insert_bookings" on bookings for insert with check (true);
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='booking_blocks' and policyname='public_read_booking_blocks') then
    create policy "public_read_booking_blocks" on booking_blocks for select using (true);
  end if;
end $$;

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index if not exists idx_bookings_service_slug on bookings (service_slug);
create index if not exists idx_bookings_status on bookings (status);
create index if not exists idx_bookings_booking_date on bookings (booking_date);
create index if not exists idx_booking_blocks_service_slug_date on booking_blocks (service_slug, block_date);

-- ─── Updated_at trigger ───────────────────────────────────────────────────────

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists set_bookings_updated_at on bookings;
create trigger set_bookings_updated_at
  before update on bookings
  for each row execute procedure set_updated_at();

-- ─── Lavender field rental service ───────────────────────────────────────────

insert into services (
  name, slug, short_description, description, price_uah, price_note, duration_note,
  status, is_featured, display_order,
  booking_type, capacity, extra_guest_price_uah, slot_start_hour, slot_end_hour
) values (
  'Оренда лавандового поля',
  'orenda-lavandovoho-polia',
  'Прогулянка, фотосесія або відпочинок серед квітучої лаванди — погодинна оренда з 06:00 до 21:00.',
  'Орендуйте лавандове поле на нашій садибі на будь-яку кількість годин. Ідеально для фотосесій, сімейних пікніків і прогулянок серед рядів квітучої лаванди. Вартість включає 5 осіб, кожна додаткова — 200 ₴. Сезон цвітіння: червень–липень.',
  1000, '₴1000 / година', 'Погодинно з 06:00 до 21:00',
  'active', true, 1,
  'hourly', 5, 200, 6, 21
)
on conflict (slug) do update set
  name = excluded.name,
  booking_type = excluded.booking_type,
  capacity = excluded.capacity,
  extra_guest_price_uah = excluded.extra_guest_price_uah,
  slot_start_hour = excluded.slot_start_hour,
  slot_end_hour = excluded.slot_end_hour,
  price_uah = excluded.price_uah,
  price_note = excluded.price_note,
  duration_note = excluded.duration_note;

-- ─── Water house rental service ───────────────────────────────────────────────

insert into services (
  name, slug, short_description, description, price_uah, price_note, duration_note,
  status, is_featured, display_order,
  booking_type, capacity, check_in_time, check_out_time
) values (
  'Оренда будиночка на воді',
  'orenda-budynochka-na-vodi',
  'Затишний будиночок над ставком — для романтики, відпочинку або сімейного свята. Заїзд о 12:00.',
  'Будиночок на воді — ідеальне місце для відпочинку над тихим ставком у тіні дерев. Вміщує до 10 осіб. Заїзд о 12:00, виїзд о 12:00 наступного дня. Оренда від 1 доби. Рибалка включена.',
  3000, '₴3000 / доба', 'Від 1 доби',
  'active', true, 2,
  'daily', 10, '12:00', '12:00'
)
on conflict (slug) do update set
  name = excluded.name,
  booking_type = excluded.booking_type,
  capacity = excluded.capacity,
  check_in_time = excluded.check_in_time,
  check_out_time = excluded.check_out_time,
  price_uah = excluded.price_uah,
  price_note = excluded.price_note,
  duration_note = excluded.duration_note;

-- ─── Lavender seedlings flower product ────────────────────────────────────────

insert into flower_products (
  name, slug, category, variety, short_description, full_description,
  price_uah, color, bloom_season, height_cm, lighting, packaging_note,
  display_order, is_featured, status, image_url
) values (
  'Саджанці лаванди',
  'sadzhantsi-lavandy',
  'lavender',
  'Lavandula angustifolia',
  'Справжня провансальська лаванда — ароматні саджанці для саду та балкону.',
  'Саджанці справжньої вузьколистої лаванди (Lavandula angustifolia) — невибаглива багаторічна рослина для саду, клумби або балкону. Цвіте у червні–липні фіолетово-синіми суцвіттями. Аромат відганяє комах і заспокоює. Висота до 60 см. Добре росте на сонці, посухостійка після укорінення.',
  150, 'фіолетово-синій', 'червень–липень', 60, 'повне сонце', 'відкритий корінь або горщик 0.5 л',
  1, true, 'available', null
)
on conflict (slug) do update set
  name = excluded.name,
  short_description = excluded.short_description,
  full_description = excluded.full_description,
  price_uah = excluded.price_uah;
