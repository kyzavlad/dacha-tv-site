-- Migration 025: Delete non-canonical honey rows — safe to run multiple times.
-- Migration 009 renamed Cyrillic slugs to English, but did not delete them if
-- the English slugs already existed (NOT EXISTS guard). This ensures only the
-- 6 canonical slugs remain.

DELETE FROM honey_products
  WHERE slug NOT IN (
    'acacia-honey', 'linden-honey', 'sunflower-honey',
    'wildflower-honey', 'orchard-honey', 'forest-honey'
  );
