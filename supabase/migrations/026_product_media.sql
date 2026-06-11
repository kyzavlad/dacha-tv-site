-- Migration 026: Unified product media table
-- Normalises all product media (images, videos, YouTube links) into one table.
-- product_section discriminates which product table the product_id refers to.
-- Old columns (image_url, gallery_images, etc.) are kept for migration compatibility;
-- they are written in sync by the admin actions from now on.

CREATE TABLE IF NOT EXISTS product_media (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_section text        NOT NULL CHECK (product_section IN ('honey', 'apiary', 'beekeeper', 'flowers')),
  product_id      uuid        NOT NULL,
  media_type      text        NOT NULL CHECK (media_type IN ('image', 'video', 'youtube')),
  url             text        NOT NULL,
  alt             text,
  position        integer     NOT NULL DEFAULT 0,
  is_primary      boolean     NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_media_lookup
  ON product_media (product_section, product_id, media_type, position);

-- One-time backfill from existing flat columns.
-- Only runs when the table has no rows yet, so re-running the migration is safe.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM product_media LIMIT 1) THEN

    -- ── Honey ──────────────────────────────────────────────────────────────
    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'honey', id, 'image', image_url, image_alt, 0, true
    FROM honey_products WHERE image_url IS NOT NULL AND image_url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'honey', hp.id, 'image', g.url, NULL, g.pos::integer, false
    FROM honey_products hp,
         LATERAL UNNEST(COALESCE(hp.gallery_images, ARRAY[]::text[])) WITH ORDINALITY AS g(url, pos)
    WHERE g.url IS NOT NULL AND g.url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'honey', id, 'video', video_url, NULL, 0, false
    FROM honey_products WHERE video_url IS NOT NULL AND video_url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'honey', id, 'youtube', youtube_video_link, NULL, 0, false
    FROM honey_products WHERE youtube_video_link IS NOT NULL AND youtube_video_link <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'honey', hp.id, 'youtube', y.url, NULL, y.pos::integer, false
    FROM honey_products hp,
         LATERAL UNNEST(COALESCE(hp.youtube_video_urls, ARRAY[]::text[])) WITH ORDINALITY AS y(url, pos)
    WHERE y.url IS NOT NULL AND y.url <> '';

    -- ── Apiary ─────────────────────────────────────────────────────────────
    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'apiary', id, 'image', image_url, image_alt, 0, true
    FROM apiary_products WHERE image_url IS NOT NULL AND image_url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'apiary', ap.id, 'image', g.url, NULL, g.pos::integer, false
    FROM apiary_products ap,
         LATERAL UNNEST(COALESCE(ap.gallery_images, ARRAY[]::text[])) WITH ORDINALITY AS g(url, pos)
    WHERE g.url IS NOT NULL AND g.url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'apiary', id, 'video', video_url, NULL, 0, false
    FROM apiary_products WHERE video_url IS NOT NULL AND video_url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'apiary', id, 'youtube', youtube_video_url, NULL, 0, false
    FROM apiary_products WHERE youtube_video_url IS NOT NULL AND youtube_video_url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'apiary', ap.id, 'youtube', y.url, NULL, y.pos::integer, false
    FROM apiary_products ap,
         LATERAL UNNEST(COALESCE(ap.youtube_video_urls, ARRAY[]::text[])) WITH ORDINALITY AS y(url, pos)
    WHERE y.url IS NOT NULL AND y.url <> '';

    -- ── Beekeeper ──────────────────────────────────────────────────────────
    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'beekeeper', id, 'image', image_url, image_alt, 0, true
    FROM beekeeper_products WHERE image_url IS NOT NULL AND image_url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'beekeeper', bp.id, 'image', g.url, NULL, g.pos::integer, false
    FROM beekeeper_products bp,
         LATERAL UNNEST(COALESCE(bp.gallery_images, ARRAY[]::text[])) WITH ORDINALITY AS g(url, pos)
    WHERE g.url IS NOT NULL AND g.url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'beekeeper', id, 'video', video_url, NULL, 0, false
    FROM beekeeper_products WHERE video_url IS NOT NULL AND video_url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'beekeeper', id, 'youtube', youtube_video_url, NULL, 0, false
    FROM beekeeper_products WHERE youtube_video_url IS NOT NULL AND youtube_video_url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'beekeeper', bp.id, 'youtube', y.url, NULL, y.pos::integer, false
    FROM beekeeper_products bp,
         LATERAL UNNEST(COALESCE(bp.youtube_video_urls, ARRAY[]::text[])) WITH ORDINALITY AS y(url, pos)
    WHERE y.url IS NOT NULL AND y.url <> '';

    -- ── Flowers ────────────────────────────────────────────────────────────
    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'flowers', id, 'image', image_url, image_alt, 0, true
    FROM flower_products WHERE image_url IS NOT NULL AND image_url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'flowers', fp.id, 'image', g.url, NULL, g.pos::integer, false
    FROM flower_products fp,
         LATERAL UNNEST(COALESCE(fp.gallery_images, ARRAY[]::text[])) WITH ORDINALITY AS g(url, pos)
    WHERE g.url IS NOT NULL AND g.url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'flowers', id, 'video', video_url, NULL, 0, false
    FROM flower_products WHERE video_url IS NOT NULL AND video_url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'flowers', id, 'youtube', youtube_video_url, NULL, 0, false
    FROM flower_products WHERE youtube_video_url IS NOT NULL AND youtube_video_url <> '';

    INSERT INTO product_media (product_section, product_id, media_type, url, alt, position, is_primary)
    SELECT 'flowers', fp.id, 'youtube', y.url, NULL, y.pos::integer, false
    FROM flower_products fp,
         LATERAL UNNEST(COALESCE(fp.youtube_video_urls, ARRAY[]::text[])) WITH ORDINALITY AS y(url, pos)
    WHERE y.url IS NOT NULL AND y.url <> '';

  END IF;
END $$;
