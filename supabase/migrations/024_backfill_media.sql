-- Backfill static image URLs where null — safe to run multiple times (WHERE IS NULL)
-- Honey products: 6 local images in public/images/dacha-tv/honey/
UPDATE honey_products SET image_url = '/images/dacha-tv/honey/acacia-honey-01.jpg',    image_alt = 'Акацієвий мед Dacha TV'       WHERE slug = 'acacia-honey'    AND image_url IS NULL;
UPDATE honey_products SET image_url = '/images/dacha-tv/honey/linden-honey-01.jpg',    image_alt = 'Липовий мед Dacha TV'         WHERE slug = 'linden-honey'    AND image_url IS NULL;
UPDATE honey_products SET image_url = '/images/dacha-tv/honey/sunflower-honey-01.jpg', image_alt = 'Соняшниковий мед Dacha TV'    WHERE slug = 'sunflower-honey' AND image_url IS NULL;
UPDATE honey_products SET image_url = '/images/dacha-tv/honey/wildflower-honey-01.jpg',image_alt = 'Мед різнотрав''я Dacha TV'    WHERE slug = 'wildflower-honey'AND image_url IS NULL;
UPDATE honey_products SET image_url = '/images/dacha-tv/honey/orchard-honey-01.jpg',   image_alt = 'Садовий мед Dacha TV'         WHERE slug = 'orchard-honey'   AND image_url IS NULL;
UPDATE honey_products SET image_url = '/images/dacha-tv/honey/forest-honey-01.jpg',    image_alt = 'Лісовий мед Dacha TV'         WHERE slug = 'forest-honey'    AND image_url IS NULL;

-- Apiary products: swarm-lure has a local image
UPDATE apiary_products SET image_url = '/images/dacha-tv/products/swarm-lure-01.jpg', image_alt = 'Приманка для роїв Dacha TV' WHERE slug = 'swarm-lure' AND image_url IS NULL;
