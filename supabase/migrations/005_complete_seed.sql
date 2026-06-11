-- Ensure site_settings row exists and all known fields are populated.
-- Uses COALESCE so admin changes made via the settings panel are preserved.
INSERT INTO site_settings (
  id,
  phone,
  phone_secondary,
  address_full,
  address_display,
  instagram_url,
  hero_tagline,
  hero_subtext
) VALUES (
  1,
  '+380967657772',
  '+380934665801',
  'Коротич, Пісочинська ОТГ, Харківська область, Україна',
  'Коротич, Харківська область',
  'https://instagram.com/dachatv.store',
  'Справжній мед. Від нашої пасіки — до вашого столу.',
  'Сімейна пасіка на Харківщині — без посередників, без домішок.'
)
ON CONFLICT (id) DO UPDATE SET
  phone            = COALESCE(site_settings.phone,           EXCLUDED.phone),
  phone_secondary  = COALESCE(site_settings.phone_secondary, EXCLUDED.phone_secondary),
  address_full     = COALESCE(site_settings.address_full,    EXCLUDED.address_full),
  address_display  = COALESCE(site_settings.address_display, EXCLUDED.address_display),
  instagram_url    = COALESCE(site_settings.instagram_url,   EXCLUDED.instagram_url),
  hero_tagline     = COALESCE(site_settings.hero_tagline,    EXCLUDED.hero_tagline),
  hero_subtext     = COALESCE(site_settings.hero_subtext,    EXCLUDED.hero_subtext);

-- Add admin_notes column to inquiries if not present (needed for InquiryCard)
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS admin_notes text;
ALTER TABLE inquiries ADD COLUMN IF NOT EXISTS notified_at timestamptz;
