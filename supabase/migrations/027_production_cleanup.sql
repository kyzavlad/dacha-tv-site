-- Migration 027: Production cleanup — enforce canonical row counts + incremental media backfill
-- Idempotent: safe to re-run on any DB state (all statements use DELETE NOT IN / NOT EXISTS).

-- ── Honey: keep exactly 6 canonical rows ──────────────────────────────────
DELETE FROM honey_products
WHERE slug NOT IN (
  'acacia-honey', 'linden-honey', 'sunflower-honey',
  'wildflower-honey', 'orchard-honey', 'forest-honey'
);

-- ── Apiary: keep exactly 4 canonical rows ─────────────────────────────────
DELETE FROM apiary_products
WHERE slug NOT IN ('swarm-lure', 'flower-pollen', 'propolis', 'nuts-in-honey');

-- ── Beekeeper: keep exactly 3 canonical rows ──────────────────────────────
DELETE FROM beekeeper_products
WHERE slug NOT IN ('bee-packages', 'bee-colonies', 'empty-hives');

-- ── Flowers: keep exactly 50 canonical rows ───────────────────────────────
DELETE FROM flower_products
WHERE slug NOT IN (
  'anastasia-white', 'malynovyi-zakhid', 'zolota-osin', 'snezhynka', 'bronzova',
  'lilovyi-son', 'rozheva-khmara', 'oranzeva-iskra', 'temno-chervona',
  'baltyka-zhovta', 'baltyka-bila', 'baltyka-rozheva', 'karmen', 'zoriana-nich',
  'soniachnyi-promin', 'persykova', 'zelenyi-chai', 'krem-briule', 'terakota',
  'bila-perlyna', 'zolotyi-lev', 'rozhevyi-zakhid', 'burhunskyi-oksemyt',
  'pomaranch', 'kremova-rehina', 'sriblaste-siaivo',
  'bila-zirochka', 'rozhevyi-doshch', 'medova-kraplia', 'lavandovyi-tuman',
  'pomarancheva-feieriia',
  'minaret-bilyi', 'minaret-rozhevyi', 'minaret-zhovtyi', 'balkon-laim',
  'anemon-rozhevyi', 'anemon-bilyi', 'anemon-bronza',
  'pavuk-zhovtyi', 'pavuk-bilyi', 'pavuk-lilovyi',
  'yahuar', 'khameleon', 'flaminho', 'leopard',
  'sybirska-krasunіa', 'zymovyi-sad', 'piznia-osin',
  'shokoladna', 'holuba-mriia'
);

-- ── Incremental product_media backfill ────────────────────────────────────
-- Inserts a primary-image row for any product that has image_url but no
-- product_media rows yet (handles products created before migration 026).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'product_media'
  ) THEN

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'honey', id, 'image', image_url, image_alt, 0, true
    FROM honey_products hp
    WHERE image_url IS NOT NULL AND image_url <> ''
      AND NOT EXISTS (
        SELECT 1 FROM product_media pm
        WHERE pm.product_section = 'honey' AND pm.product_id = hp.id
      );

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'apiary', id, 'image', image_url, image_alt, 0, true
    FROM apiary_products ap
    WHERE image_url IS NOT NULL AND image_url <> ''
      AND NOT EXISTS (
        SELECT 1 FROM product_media pm
        WHERE pm.product_section = 'apiary' AND pm.product_id = ap.id
      );

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'beekeeper', id, 'image', image_url, image_alt, 0, true
    FROM beekeeper_products bp
    WHERE image_url IS NOT NULL AND image_url <> ''
      AND NOT EXISTS (
        SELECT 1 FROM product_media pm
        WHERE pm.product_section = 'beekeeper' AND pm.product_id = bp.id
      );

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'flowers', id, 'image', image_url, image_alt, 0, true
    FROM flower_products fp
    WHERE image_url IS NOT NULL AND image_url <> ''
      AND NOT EXISTS (
        SELECT 1 FROM product_media pm
        WHERE pm.product_section = 'flowers' AND pm.product_id = fp.id
      );

  END IF;
END $$;
