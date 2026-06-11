-- ================================================================
-- Migration 023: Canonical product seed
--
-- Ensures all products exist in DB with correct canonical data.
-- For media fields (image_url, image_alt, youtube links): uses
-- COALESCE to preserve any admin-uploaded value and only backfills
-- if the column is currently NULL.
-- All other fields (name, price, description, status) are reset
-- to canonical values.
-- Safe to re-run (idempotent via ON CONFLICT (slug) DO UPDATE).
-- ================================================================

-- ─── Stale row cleanup ───────────────────────────────────────────
DELETE FROM apiary_products
WHERE slug NOT IN ('swarm-lure', 'flower-pollen', 'propolis', 'nuts-in-honey');

DELETE FROM beekeeper_products
WHERE slug NOT IN ('bee-packages', 'bee-colonies', 'empty-hives');

-- ─── Honey (6 products) ─────────────────────────────────────────
INSERT INTO honey_products (
  name, slug, variety, description, short_description, full_description,
  aroma_notes, taste_notes, color_note, crystallization_note,
  recommended_use, packaging_note, packaging,
  price_plastic_uah, price_glass_uah,
  is_featured, status, display_order,
  image_url, image_alt, youtube_video_link
) VALUES
  (
    'Акацієвий мед', 'acacia-honey', 'Акація', NULL,
    'Ніжний, світлий мед із делікатним ароматом та повільною кристалізацією.',
    'Акацієвий мед цінується за м''який смак, світлий відтінок і легкий квітковий аромат. Це один із найбільш делікатних сортів, який довше залишається рідким і добре підходить для щоденного вживання.',
    'Легкий квітковий, ненав''язливий',
    'Ніжний, злегка вершковий, без різких відтінків',
    'Дуже світлий, майже прозорий',
    'Кристалізується дуже повільно — іноді залишається рідким до року і довше.',
    'Щоденне вживання, чай, дитяче харчування, подарунки.',
    '1 л. Пластикова та скляна банка.',
    ARRAY['1 л пластик', '1 л скло'],
    320, 360, true, 'available', 1,
    '/images/dacha-tv/honey/acacia-honey-01.jpg',
    'Акацієвий мед Dacha TV', NULL
  ),
  (
    'Липовий мед', 'linden-honey', 'Липа', NULL,
    'Класичний запашний мед із виразним ароматом липового цвіту.',
    'Липовий мед має насичений аромат, характерний трав''янисто-квітковий профіль і традиційно вважається одним із найулюбленіших сортів. Добре підходить до чаю та для домашнього запасу.',
    'Насичений, квітково-трав''янистий',
    'Насичений, з легкою приємною гіркуватістю',
    'Від світло-жовтого до золотисто-янтарного',
    'Кристалізується за 2–3 місяці. Кристали середнього розміру.',
    'Чай, щоденне вживання, підтримка імунітету в сезон застуд.',
    '1 л. Пластикова та скляна банка.',
    ARRAY['1 л пластик', '1 л скло'],
    300, 340, true, 'available', 2,
    '/images/dacha-tv/honey/linden-honey-01.jpg',
    'Липовий мед Dacha TV', NULL
  ),
  (
    'Соняшниковий мед', 'sunflower-honey', 'Сонях', NULL,
    'Насичений золотистий мед із виразним смаком і швидшою кристалізацією.',
    'Соняшниковий мед має яскравий колір, щільнішу текстуру та характерний солодкий смак. Це популярний повсякденний сорт, добре знайомий багатьом покупцям.',
    'Характерний, теплий, медово-квітковий',
    'Насичений, жирний, виразний соняшниковий',
    'Яскраво-золотистий, насичений',
    'Кристалізується дуже швидко — за 2–4 тижні після відкачки. Кристали дрібні й тверді.',
    'Намазати на хліб, додати в кашу. Підходить для тривалого зберігання.',
    '1 л. Пластикова та скляна банка.',
    ARRAY['1 л пластик', '1 л скло'],
    270, 310, true, 'available', 3,
    '/images/dacha-tv/honey/sunflower-honey-01.jpg',
    'Соняшниковий мед Dacha TV', NULL
  ),
  (
    'Мед різнотрав''я', 'wildflower-honey', 'Різнотрав''я', NULL,
    'Багатий природний смак із поєднанням нектару різних польових рослин.',
    'Мед різнотрав''я збирається з багатьох літніх квітів, тому має багатший і глибший смаковий профіль. Кожна партія може мати свій характер залежно від сезону та медоносів.',
    'Складний, багатошаровий, природний',
    'Глибокий, зі змінним характером залежно від партії',
    'Від золотистого до янтарного',
    'Кристалізується за 1–3 місяці залежно від складу нектару.',
    'Універсальний. Щоденне вживання, випічка, чай.',
    '1 л. Пластикова та скляна банка.',
    ARRAY['1 л пластик', '1 л скло'],
    290, 330, false, 'available', 4,
    '/images/dacha-tv/honey/wildflower-honey-01.jpg',
    'Мед різнотрав''я Dacha TV', NULL
  ),
  (
    'Садовий мед', 'orchard-honey', 'Сади', NULL,
    'Ароматний мед із м''яким фруктово-квітковим характером.',
    'Садовий мед формується з весняного цвіту плодових дерев та інших садових медоносів. Він має приємний квітковий аромат і м''який смак, який добре підходить для сімейного столу.',
    'Квітково-фруктовий, весняний',
    'М''який, ніжний, з фруктовими нотками',
    'Світло-жовтий, прозорий',
    'Кристалізується за 2–3 місяці. Кристали м''які та дрібні.',
    'Чай, десерти, сир. Ідеально для сімейного столу.',
    '1 л. Пластикова та скляна банка.',
    ARRAY['1 л пластик', '1 л скло'],
    310, 350, false, 'available', 5,
    '/images/dacha-tv/honey/orchard-honey-01.jpg',
    'Садовий мед Dacha TV', NULL
  ),
  (
    'Лісовий мед', 'forest-honey', 'Ліс', NULL,
    'Глибший, більш насичений смак із виразним природним характером.',
    'Лісовий мед зазвичай має темніший відтінок, більш глибокий аромат і насичений смак. Це добрий вибір для тих, хто любить більш яскравий медовий профіль.',
    'Смолистий, деревний, складний',
    'Темний, насичений, з мінеральними нотками',
    'Темно-янтарний, коричнюватий',
    'Кристалізується повільно. Може зберігатися рідким тривалий час.',
    'Для цінителів — самостійно або до страв із м''ясом та сирами.',
    '1 л. Пластикова та скляна банка.',
    ARRAY['1 л пластик', '1 л скло'],
    330, 370, false, 'available', 6,
    '/images/dacha-tv/honey/forest-honey-01.jpg',
    'Лісовий мед Dacha TV', NULL
  )
ON CONFLICT (slug) DO UPDATE SET
  name                 = EXCLUDED.name,
  variety              = EXCLUDED.variety,
  short_description    = EXCLUDED.short_description,
  full_description     = EXCLUDED.full_description,
  aroma_notes          = EXCLUDED.aroma_notes,
  taste_notes          = EXCLUDED.taste_notes,
  color_note           = EXCLUDED.color_note,
  crystallization_note = EXCLUDED.crystallization_note,
  recommended_use      = EXCLUDED.recommended_use,
  packaging_note       = EXCLUDED.packaging_note,
  packaging            = EXCLUDED.packaging,
  price_plastic_uah    = EXCLUDED.price_plastic_uah,
  price_glass_uah      = EXCLUDED.price_glass_uah,
  is_featured          = EXCLUDED.is_featured,
  status               = EXCLUDED.status,
  display_order        = EXCLUDED.display_order,
  image_url            = COALESCE(honey_products.image_url, EXCLUDED.image_url),
  image_alt            = COALESCE(honey_products.image_alt, EXCLUDED.image_alt),
  youtube_video_link   = COALESCE(honey_products.youtube_video_link, EXCLUDED.youtube_video_link);

-- ─── Apiary (4 products) ────────────────────────────────────────
INSERT INTO apiary_products (
  name, slug, description, short_description, full_description,
  composition, usage_notes, storage_info, packaging_note, packaging,
  weight_g, price_uah, is_featured, status, display_order,
  image_url, image_alt, youtube_video_url
) VALUES
  (
    'Приманка для роїв', 'swarm-lure',
    'Приманка для роїв використовується в сезон роїння для підвищення шансів заселення пастки або підготовленого вулика.',
    'Готова приманка для приваблення бджолиних роїв у компактній зручній банці.',
    'Приманка для роїв використовується в сезон роїння для підвищення шансів заселення пастки або підготовленого вулика. Зручний формат банки дозволяє легко використовувати продукт у практичній роботі на пасіці.',
    NULL,
    'Нанесіть невелику кількість на внутрішні стінки вулика-пастки за 1–2 дні до очікуваного роїння. Також обробіть льоток. Повторіть через тиждень за потреби.',
    'Зберігати в прохолодному темному місці при температурі до +20°C. Термін придатності — 2 роки.',
    'Банка 35 г.',
    ARRAY['35 г'],
    35, 180, true, 'available', 1,
    '/images/dacha-tv/products/swarm-lure-01.jpg',
    'Приманка для роїв Dacha TV', NULL
  ),
  (
    'Квітковий пилок', 'flower-pollen',
    'Натуральний квітковий пилок зібраний на нашій пасіці.',
    'Свіжий квітковий пилок — джерело вітамінів, амінокислот та мікроелементів.',
    'Квітковий пилок містить понад 250 біологічно активних речовин. Рекомендується для підтримки імунітету та загального оздоровлення організму.',
    'Натуральний квітковий пилок',
    'Вживати по 1–2 чайні ложки на день, запиваючи водою або розчиняючи в меду.',
    'Зберігати в холодильнику або морозильній камері.',
    '50 г, 100 г',
    ARRAY['50 г', '100 г'],
    100, 180, false, 'available', 2,
    NULL, 'Квітковий пилок Dacha TV', NULL
  ),
  (
    'Прополіс', 'propolis',
    'Натуральний прополіс із нашої пасіки.',
    'Натуральний прополіс — природний антисептик та імуностимулятор.',
    'Прополіс має сильні антибактеріальні та антивірусні властивості. Використовується як природний антисептик і для підтримки імунної системи.',
    NULL,
    'Вживати у вигляді настоянки або додавати до меду.',
    'Зберігати в прохолодному темному місці.',
    '20 г',
    ARRAY['20 г'],
    20, 120, false, 'available', 3,
    NULL, 'Прополіс Dacha TV', NULL
  ),
  (
    'Горіхи в меду', 'nuts-in-honey',
    'Суміш волоських горіхів і мигдалю в натуральному меду.',
    'Волоські горіхи та мигдаль у натуральному меді — корисне та смачне ласощі.',
    'Суміш відборних горіхів у натуральному меді. Енергетичний та поживний продукт, що поєднує корисні властивості меду та горіхів.',
    'Натуральний мед, волоські горіхи, мигдаль',
    'Вживати по 1–2 столові ложки на день як самостійний десерт або з хлібом.',
    'Зберігати в прохолодному темному місці. Термін придатності — 12 місяців.',
    '200 г, 500 г',
    ARRAY['200 г', '500 г'],
    200, 230, false, 'available', 4,
    NULL, 'Горіхи в меду Dacha TV', NULL
  )
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  description       = EXCLUDED.description,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  composition       = EXCLUDED.composition,
  usage_notes       = EXCLUDED.usage_notes,
  storage_info      = EXCLUDED.storage_info,
  packaging_note    = EXCLUDED.packaging_note,
  packaging         = EXCLUDED.packaging,
  weight_g          = EXCLUDED.weight_g,
  price_uah         = EXCLUDED.price_uah,
  is_featured       = EXCLUDED.is_featured,
  status            = EXCLUDED.status,
  display_order     = EXCLUDED.display_order,
  image_url         = COALESCE(apiary_products.image_url, EXCLUDED.image_url),
  image_alt         = COALESCE(apiary_products.image_alt, EXCLUDED.image_alt),
  youtube_video_url = COALESCE(apiary_products.youtube_video_url, EXCLUDED.youtube_video_url);

-- ─── Beekeeper (3 products) ─────────────────────────────────────
INSERT INTO beekeeper_products (
  name, slug, product_type, description, full_description,
  breeds, season_note, display_order, status, is_featured,
  image_url, image_alt, youtube_video_url
) VALUES
  (
    'Бджолопакети', 'bee-packages', 'bee_packages',
    'Бджолопакети порід Buckfast та Карніка. Спокійні, продуктивні породи. Доступні з квітня по червень.',
    NULL,
    ARRAY['Buckfast', 'Карніка'],
    'Доступні з квітня по червень',
    1, 'available', false, NULL, NULL, NULL
  ),
  (
    'Бджолосімї', 'bee-colonies', 'bee_colonies',
    'Повноцінні бджолосімї у вуликах. Підходять для початківців і досвідчених пасічників.',
    NULL,
    ARRAY['Buckfast', 'Карніка'],
    'Доступні з квітня по серпень',
    2, 'available', false, NULL, NULL, NULL
  ),
  (
    'Порожні вулики', 'empty-hives', 'empty_hives',
    'Порожні вулики для самостійного заселення. Уточнюйте наявність та конструкцію.',
    NULL, NULL, NULL,
    3, 'available', false, NULL, NULL, NULL
  )
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  product_type      = EXCLUDED.product_type,
  description       = EXCLUDED.description,
  full_description  = EXCLUDED.full_description,
  breeds            = EXCLUDED.breeds,
  season_note       = EXCLUDED.season_note,
  display_order     = EXCLUDED.display_order,
  status            = EXCLUDED.status,
  is_featured       = EXCLUDED.is_featured,
  image_url         = COALESCE(beekeeper_products.image_url, EXCLUDED.image_url),
  image_alt         = COALESCE(beekeeper_products.image_alt, EXCLUDED.image_alt),
  youtube_video_url = COALESCE(beekeeper_products.youtube_video_url, EXCLUDED.youtube_video_url);

-- ─── Flowers (50 products) ──────────────────────────────────────
INSERT INTO flower_products (
  name, slug, category, variety,
  short_description, full_description,
  price_uah, color, bloom_season, height_cm,
  lighting, packaging_note, display_order,
  status, is_featured, image_url, image_alt, youtube_video_url
) VALUES
  ('Anastasia White','anastasia-white','chrysanthemum','Помпонова','Класична помпонова хризантема з сніжно-білими суцвіттями. Один із найпопулярніших сортів для зрізу.','Компактні кулясті суцвіття діаметром 4–6 см. Довга ваза — до 14 днів. Ідеальна для букетів і весільних композицій.',75,'Білий','Вересень–Жовтень',65,'Сонце','Укорінений живець або паросток',1,'available',true,NULL,'Anastasia White — біла помпонова хризантема',NULL),
  ('Малиновий захід','malynovyi-zakhid','chrysanthemum','Помпонова','Яскраво-малинові кульки з легким перламутровим відливом. Сорт стійкий до осінніх дощів.','Висота куща до 60 см, рясне цвітіння. Відмінно підходить для вазонного вирощування і клумб.',80,'Малиновий','Жовтень',60,'Сонце','Укорінений живець',2,'available',true,NULL,'Малиновий захід — малинова помпонова хризантема',NULL),
  ('Золота осінь','zolota-osin','chrysanthemum','Помпонова','Соковито-жовті суцвіття на міцних стеблах. Класика осіннього саду.',NULL,70,'Жовтий','Вересень–Жовтень',55,'Сонце',NULL,3,'available',false,NULL,NULL,NULL),
  ('Сніжинка','snezhynka','chrysanthemum','Помпонова','Дрібні білі суцвіття з кремовим центром. Ніжний, «хмарний» вигляд.',NULL,70,'Білий/Кремовий','Жовтень',50,'Сонце',NULL,4,'available',false,NULL,NULL,NULL),
  ('Бронзова','bronzova','chrysanthemum','Помпонова','Мідно-бронзовий відтінок із переходом у теракоту. Модна осіння палітра.',NULL,75,'Бронзовий','Жовтень',60,'Сонце',NULL,5,'available',false,NULL,NULL,NULL),
  ('Ліловий сон','lilovyi-son','chrysanthemum','Помпонова','Пастельно-ліловий колір, що підсилюється на прохолоді. Чарівна осіння квітка.',NULL,80,'Ліловий','Жовтень',55,'Сонце',NULL,6,'available',false,NULL,NULL,NULL),
  ('Рожева хмара','rozheva-khmara','chrysanthemum','Помпонова','Ніжно-рожеві кульки, дуже рясне цвітіння. Чудово виглядає в масових посадках.',NULL,75,'Рожевий','Вересень–Жовтень',55,'Сонце',NULL,7,'available',false,NULL,NULL,NULL),
  ('Оранжева іскра','oranzeva-iskra','chrysanthemum','Помпонова','Яскраво-помаранчеві суцвіття — справжня окраса осіннього саду.',NULL,70,'Помаранчевий','Жовтень',50,'Сонце',NULL,8,'available',false,NULL,NULL,NULL),
  ('Темно-червона','temno-chervona','chrysanthemum','Помпонова','Насичено-бордовий колір із оксамитовою текстурою пелюсток.',NULL,80,'Бордо/Темно-червоний','Жовтень',60,'Сонце',NULL,9,'available',false,NULL,NULL,NULL),
  ('Балтика Жовта','baltyka-zhovta','chrysanthemum','Кущова','Кущова хризантема з яскраво-жовтими суцвіттями середнього розміру. Зимостійка.','Кущ розгалужений, висотою до 70 см. Суцвіття 6–8 см, щільні, довго тримаються у вазі.',85,'Жовтий','Вересень–Жовтень',70,'Сонце','Укорінений живець',10,'available',true,NULL,'Балтика Жовта — кущова хризантема',NULL),
  ('Балтика Біла','baltyka-bila','chrysanthemum','Кущова','Білосніжна кущова хризантема — класика для зрізу та клумб.',NULL,85,'Білий','Вересень–Жовтень',70,'Сонце',NULL,11,'available',false,NULL,NULL,NULL),
  ('Балтика Рожева','baltyka-rozheva','chrysanthemum','Кущова','Ніжно-рожеві суцвіття з кремовим центром. Популярна в осінніх букетах.',NULL,85,'Рожевий','Вересень–Жовтень',70,'Сонце',NULL,12,'available',false,NULL,NULL,NULL),
  ('Кармен','karmen','chrysanthemum','Кущова','Малинові суцвіття з темнішим центром. Назва говорить сама за себе — пристрасна й виразна.',NULL,90,'Малиново-бордовий','Жовтень',65,'Сонце',NULL,13,'available',false,NULL,NULL,NULL),
  ('Зоряна ніч','zoriana-nich','chrysanthemum','Кущова','Темно-фіолетові суцвіття зі срібним відтінком. Ефектна квітка для контрастних композицій.',NULL,90,'Фіолетовий','Жовтень',60,'Сонце',NULL,14,'available',false,NULL,NULL,NULL),
  ('Сонячний промінь','soniachnyi-promin','chrysanthemum','Кущова','Яскраво-жовтогарячі суцвіття, стійкість до дощу та вітру. Незамінна на клумбі.',NULL,80,'Жовтогарячий','Вересень–Жовтень',65,'Сонце',NULL,15,'available',false,NULL,NULL,NULL),
  ('Персикова','persykova','chrysanthemum','Кущова','Персиково-абрикосовий відтінок, що рідко зустрічається у кущових хризантем.',NULL,90,'Персиковий','Жовтень',60,'Сонце',NULL,16,'available',false,NULL,NULL,NULL),
  ('Зелений чай','zelenyi-chai','chrysanthemum','Кущова','Незвичайна хризантема з салатово-зеленими суцвіттями. Оригінально виглядає в букеті.',NULL,95,'Зелений','Жовтень',65,'Сонце',NULL,17,'available',false,NULL,NULL,NULL),
  ('Крем-брюле','krem-briule','chrysanthemum','Кущова','Кремово-вершковий тон із легким рожевим підтоном. Витончена й ніжна.',NULL,85,'Кремовий','Вересень–Жовтень',60,'Сонце',NULL,18,'available',false,NULL,NULL,NULL),
  ('Теракота','terakota','chrysanthemum','Кущова','Земляний теракотово-іржавий колір — актуальний тренд флористики.',NULL,90,'Теракота','Жовтень',65,'Сонце',NULL,19,'available',false,NULL,NULL,NULL),
  ('Біла перлина','bila-perlyna','chrysanthemum','Великоквіткова','Одностеблова хризантема з великою квіткою діаметром 16–20 см. Ідеальна для показових букетів.','Класична великоквіткова хризантема для зрізу. Утворює одну велику квітку на стеблі. Потребує пасинкування.',110,'Білий','Жовтень–Листопад',90,'Сонце','Укорінений живець',20,'available',true,NULL,'Біла перлина — великоквіткова хризантема',NULL),
  ('Золотий лев','zolotyi-lev','chrysanthemum','Великоквіткова','Золотисто-жовта великоквіткова хризантема з щільними пелюстками. Виставковий сорт.',NULL,120,'Золотисто-жовтий','Жовтень–Листопад',95,'Сонце',NULL,21,'available',false,NULL,NULL,NULL),
  ('Рожевий захід','rozhevyi-zakhid','chrysanthemum','Великоквіткова','Ніжно-рожева квітка з інтенсивнішим кольором у центрі. Виглядає розкішно.',NULL,115,'Рожевий','Жовтень',90,'Сонце',NULL,22,'available',false,NULL,NULL,NULL),
  ('Бургундський оксамит','burhunskyi-oksemyt','chrysanthemum','Великоквіткова','Глибокий бургундський колір із оксамитовою текстурою. Розкіш для осіннього букету.',NULL,125,'Бургундський','Жовтень–Листопад',95,'Сонце',NULL,23,'available',false,NULL,NULL,NULL),
  ('Помаранч','pomaranch','chrysanthemum','Великоквіткова','Яскраво-помаранчева квітка великого розміру. Привертає увагу здалеку.',NULL,110,'Помаранчевий','Жовтень',85,'Сонце',NULL,24,'available',false,NULL,NULL,NULL),
  ('Кремова регіна','kremova-rehina','chrysanthemum','Великоквіткова','Кремово-білий колір із ледь помітним лимонним відтінком у центрі.',NULL,115,'Кремовий','Жовтень–Листопад',90,'Сонце',NULL,25,'available',false,NULL,NULL,NULL),
  ('Сріблясте сяйво','sriblaste-siaivo','chrysanthemum','Великоквіткова','Сріблясто-бузковий відтінок з виразним виставковим виглядом.',NULL,130,'Сріблясто-бузковий','Листопад',100,'Сонце',NULL,26,'available',false,NULL,NULL,NULL),
  ('Біла зірочка','bila-zirochka','chrysanthemum','Дрібноквіткова','Безліч дрібних білих ромашкоподібних квіток на одному кущі. Витончено й легко.','Утворює хмарку з квіток діаметром 2–3 см. Чудово виглядає в масових посадках і живоплотах.',65,'Білий','Вересень–Жовтень',50,'Сонце',NULL,27,'available',false,NULL,NULL,NULL),
  ('Рожевий дощ','rozhevyi-doshch','chrysanthemum','Дрібноквіткова','Ніжні рожеві суцвіття розміром з монетку. Рясне довготривале цвітіння.',NULL,65,'Рожевий','Вересень–Жовтень',45,'Сонце',NULL,28,'available',false,NULL,NULL,NULL),
  ('Медова крапля','medova-kraplia','chrysanthemum','Дрібноквіткова','Медово-жовті дрібні квітки. Невибаглива у догляді, стійка до морозів.',NULL,65,'Медово-жовтий','Жовтень',45,'Сонце',NULL,29,'available',false,NULL,NULL,NULL),
  ('Лавандовий туман','lavandovyi-tuman','chrysanthemum','Дрібноквіткова','Лавандові дрібні квітки зі срібним відблиском. Незвична кольорова гама.',NULL,70,'Лавандовий','Жовтень',50,'Сонце',NULL,30,'available',false,NULL,NULL,NULL),
  ('Помаранчева феєрія','pomarancheva-feieriia','chrysanthemum','Дрібноквіткова','Соковито-помаранчеві дрібні квіти — яскрава пляма на клумбі в жовтні.',NULL,65,'Помаранчевий','Жовтень',45,'Сонце',NULL,31,'available',false,NULL,NULL,NULL),
  ('Мінарет Білий','minaret-bilyi','chrysanthemum','Компактна','Компактний кущ висотою до 35 см з рясними білими суцвіттями. Ідеальна для вазонів.','Не потребує пасинкування. Відмінно розростається в горщиках і контейнерах на балконі.',75,'Білий','Жовтень',35,'Сонце','Укорінений живець',32,'available',false,NULL,'Мінарет Білий — компактна хризантема',NULL),
  ('Мінарет Рожевий','minaret-rozhevyi','chrysanthemum','Компактна','Рожева компактна хризантема — маленька, але дуже рясноцвіта.',NULL,75,'Рожевий','Жовтень',35,'Сонце',NULL,33,'available',false,NULL,NULL,NULL),
  ('Мінарет Жовтий','minaret-zhovtyi','chrysanthemum','Компактна','Жовта компактна форма. Невибаглива, морозостійка, підходить для новачків.',NULL,70,'Жовтий','Жовтень',30,'Сонце',NULL,34,'available',false,NULL,NULL,NULL),
  ('Балкон Лайм','balkon-laim','chrysanthemum','Компактна','Салатово-лаймовий колір, компактний кущ — хіт для балконних вазонів.',NULL,80,'Салатовий/Лайм','Жовтень',30,'Сонце',NULL,35,'available',false,NULL,NULL,NULL),
  ('Анемон Рожевий','anemon-rozhevyi','chrysanthemum','Анемонова','Характерна будова квітки: плоскі зовнішні пелюстки й опукле центральне вічко. Унікально.','Анемоновидна хризантема виглядає як два квіти в одному. Пухнастий центр гармоніює з плоскими крайовими пелюстками.',90,'Рожевий','Вересень–Жовтень',60,'Сонце',NULL,36,'available',false,NULL,NULL,NULL),
  ('Анемон Білий','anemon-bilyi','chrysanthemum','Анемонова','Білі пелюстки та жовто-зелений центр. Нагадує велику ромашку з характером.',NULL,90,'Білий/Жовтий центр','Жовтень',55,'Сонце',NULL,37,'available',false,NULL,NULL,NULL),
  ('Анемон Бронза','anemon-bronza','chrysanthemum','Анемонова','Бронзово-помаранчеві крайові пелюстки та густий рудий центр. Незвична осіння краса.',NULL,95,'Бронзово-помаранчевий','Жовтень',60,'Сонце',NULL,38,'available',false,NULL,NULL,NULL),
  ('Павук Жовтий','pavuk-zhovtyi','chrysanthemum','Павукоподібна','Довгі закручені пелюстки золотисто-жовтого кольору. Екзотичний вигляд, яскравий акцент.','Spider (павукоподібна) хризантема з трубчастими звивистими пелюстками 10–15 см. Діаметр квітки до 25 см.',120,'Золотисто-жовтий','Жовтень–Листопад',100,'Сонце','Укорінений живець',39,'available',true,NULL,'Павук Жовтий — павукоподібна хризантема',NULL),
  ('Павук Білий','pavuk-bilyi','chrysanthemum','Павукоподібна','Крученопелюсткова хризантема в молочно-білому кольорі. Ефектна у флористиці.',NULL,120,'Молочно-білий','Жовтень–Листопад',95,'Сонце',NULL,40,'available',false,NULL,NULL,NULL),
  ('Павук Ліловий','pavuk-lilovyi','chrysanthemum','Павукоподібна','Ліловий spider — рідкісний та ефектний. Виставковий сорт.',NULL,130,'Ліловий','Листопад',100,'Сонце',NULL,41,'available',false,NULL,NULL,NULL),
  ('Ягуар','yahuar','chrysanthemum','Помпонова','Жовті пелюстки з червоно-бронзовими кінчиками. Кожна квітка виглядає унікально.',NULL,85,'Жовтий/Бронзовий','Жовтень',60,'Сонце',NULL,42,'available',false,NULL,NULL,NULL),
  ('Хамелеон','khameleon','chrysanthemum','Кущова','Колір змінюється з рожевого до коралового залежно від температури. Унікальний сорт.',NULL,95,'Рожево-кораловий','Жовтень',65,'Сонце',NULL,43,'available',false,NULL,NULL,NULL),
  ('Фламінго','flaminho','chrysanthemum','Великоквіткова','Рожево-помаранчевий градієнт від центру до кінців пелюсток. Ефектна для виставок.',NULL,125,'Рожево-помаранчевий','Жовтень–Листопад',90,'Сонце',NULL,44,'available',false,NULL,NULL,NULL),
  ('Леопард','leopard','chrysanthemum','Помпонова','Білі пелюстки з рожево-малиновим штрихуванням. Незвичайний, «плямистий» ефект.',NULL,85,'Білий/Рожевий','Жовтень',55,'Сонце',NULL,45,'available',false,NULL,NULL,NULL),
  ('Сибірська красуня','sybirska-krasunіa','chrysanthemum','Кущова','Надзвичайно морозостійкий сорт — цвіте навіть після легких морозів. Для відкритого ґрунту.',NULL,90,'Рожево-ліловий','Жовтень–Листопад',70,'Сонце',NULL,46,'available',false,NULL,NULL,NULL),
  ('Зимовий сад','zymovyi-sad','chrysanthemum','Помпонова','Пізньоцвітний сорт — найдовше залишається в саду. Стійкий до заморозків до -7°C.',NULL,80,'Білий/Кремовий','Листопад',55,'Сонце',NULL,47,'available',false,NULL,NULL,NULL),
  ('Пізня осінь','piznia-osin','chrysanthemum','Кущова','Насичено-бордові суцвіття в кінці сезону. Останній барвистий акорд саду.',NULL,85,'Бордо','Листопад',65,'Сонце',NULL,48,'available',false,NULL,NULL,NULL),
  ('Шоколадна','shokoladna','chrysanthemum','Помпонова','Темно-шоколадний, майже коричневий відтінок. Дуже рідкісна й затребувана флористами.',NULL,100,'Шоколадний/Коричневий','Жовтень',60,'Сонце',NULL,49,'available',true,NULL,NULL,NULL),
  ('Голуба мрія','holuba-mriia','chrysanthemum','Великоквіткова','Бузково-блакитний відтінок — одна з найрідкісніших барв у хризантем. Колекційний сорт.','Дуже рідкісна забарвлення для хризантеми. Квітка утворює один великий бутон діаметром до 18 см. Використовується на виставках.',130,'Бузково-блакитний','Жовтень–Листопад',95,'Сонце','Укорінений живець (обмежена кількість)',50,'available',true,NULL,'Голуба мрія — рідкісна велика хризантема',NULL)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  variety           = EXCLUDED.variety,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  price_uah         = EXCLUDED.price_uah,
  color             = EXCLUDED.color,
  bloom_season      = EXCLUDED.bloom_season,
  height_cm         = EXCLUDED.height_cm,
  lighting          = EXCLUDED.lighting,
  packaging_note    = EXCLUDED.packaging_note,
  display_order     = EXCLUDED.display_order,
  status            = EXCLUDED.status,
  is_featured       = EXCLUDED.is_featured,
  image_url         = COALESCE(flower_products.image_url, EXCLUDED.image_url),
  image_alt         = COALESCE(flower_products.image_alt, EXCLUDED.image_alt),
  youtube_video_url = COALESCE(flower_products.youtube_video_url, EXCLUDED.youtube_video_url);
