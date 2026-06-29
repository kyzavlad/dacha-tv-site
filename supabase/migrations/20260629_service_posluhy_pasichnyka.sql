-- ============================================================================
-- Migration: 20260629_service_posluhy_pasichnyka
-- ============================================================================
-- Adds the third service "Послуги пасічника" (slug: posluhy-pasichnyka) to the
-- /services page. Non-bookable consultation service (no booking_type), so the
-- card shows "Дізнатися більше". Idempotent and additive — does NOT touch the
-- lavender (orenda-lavandovoho-polia) or water-house (orenda-budynochka-na-vodi)
-- services. Safe to re-run.
-- ============================================================================

insert into services (
  name, slug, short_description, description,
  price_uah, price_note, duration_note,
  status, is_featured, display_order
) values (
  'Послуги пасічника',
  'posluhy-pasichnyka',
  'Консультація, обслуговування вуликів і практична допомога від досвідченого пасічника.',
  'Наш пасічник з багаторічним досвідом допоможе з оглядом і обслуговуванням вуликів, консультацією щодо розведення бджіл, лікуванням сімей та підготовкою до зими. Послуги надаються на вашій або нашій пасіці.',
  null, 'Ціна за домовленістю', 'За домовленістю',
  'active', false, 3
)
on conflict (slug) do update set
  name              = excluded.name,
  short_description = excluded.short_description,
  description       = excluded.description,
  price_note        = excluded.price_note,
  duration_note     = excluded.duration_note,
  status            = 'active';
