-- Migration 033: Production seed
-- Idempotent UPSERT for all canonical products.
-- Uses COALESCE to preserve any admin-edited content already in production.
-- Safe to re-run at any time.

-- ─── Apiary products ─────────────────────────────────────────────────────────

INSERT INTO apiary_products (
  slug, name, description, short_description, full_description,
  composition, usage_notes, storage_info, packaging_note, packaging,
  price_uah, weight_g, is_featured, status, display_order,
  image_url, image_alt
) VALUES
(
  'flower-pollen',
  'Квітковий пилок',
  'Натуральний квітковий пилок зібраний на нашій пасіці.',
  'Свіжий квітковий пилок — джерело вітамінів, амінокислот та мікроелементів.',
  'Квітковий пилок містить понад 250 біологічно активних речовин. Рекомендується для підтримки імунітету та загального оздоровлення організму.',
  'Натуральний квітковий пилок',
  'Вживати по 1–2 чайні ложки на день, запиваючи водою або розчиняючи в меду.',
  'Зберігати в холодильнику або морозильній камері.',
  '50 г, 100 г',
  ARRAY['50 г', '100 г'],
  180, 100, false, 'available', 1,
  NULL, 'Квітковий пилок Дача TV'
),
(
  'propolis',
  'Прополіс',
  'Натуральний прополіс із нашої пасіки.',
  'Натуральний прополіс — природний антисептик та імуностимулятор.',
  'Прополіс має сильні антибактеріальні та антивірусні властивості. Використовується як природний антисептик і для підтримки імунної системи.',
  NULL,
  'Вживати у вигляді настоянки або додавати до меду.',
  'Зберігати в прохолодному темному місці.',
  '20 г',
  ARRAY['20 г'],
  120, 20, false, 'available', 2,
  NULL, 'Прополіс Дача TV'
),
(
  'nuts-in-honey',
  'Горіхи в меду',
  'Суміш волоських горіхів і мигдалю в натуральному меду.',
  'Волоські горіхи та мигдаль у натуральному меді — корисне та смачне ласощі.',
  'Суміш відборних горіхів у натуральному меді. Енергетичний та поживний продукт, що поєднує корисні властивості меду та горіхів.',
  'Натуральний мед, волоські горіхи, мигдаль',
  'Вживати по 1–2 столові ложки на день як самостійний десерт або з хлібом.',
  'Зберігати в прохолодному темному місці. Термін придатності — 12 місяців.',
  '200 г, 500 г',
  ARRAY['200 г', '500 г'],
  230, 200, false, 'available', 3,
  NULL, 'Горіхи в меду Дача TV'
)
ON CONFLICT (slug) DO UPDATE SET
  name            = COALESCE(NULLIF(apiary_products.name, ''), EXCLUDED.name),
  description     = COALESCE(apiary_products.description, EXCLUDED.description),
  short_description = COALESCE(apiary_products.short_description, EXCLUDED.short_description),
  full_description  = COALESCE(apiary_products.full_description, EXCLUDED.full_description),
  composition     = COALESCE(apiary_products.composition, EXCLUDED.composition),
  usage_notes     = COALESCE(apiary_products.usage_notes, EXCLUDED.usage_notes),
  storage_info    = COALESCE(apiary_products.storage_info, EXCLUDED.storage_info),
  packaging_note  = COALESCE(apiary_products.packaging_note, EXCLUDED.packaging_note),
  packaging       = COALESCE(apiary_products.packaging, EXCLUDED.packaging),
  price_uah       = COALESCE(apiary_products.price_uah, EXCLUDED.price_uah),
  weight_g        = COALESCE(apiary_products.weight_g, EXCLUDED.weight_g),
  status          = COALESCE(apiary_products.status, EXCLUDED.status),
  image_alt       = COALESCE(apiary_products.image_alt, EXCLUDED.image_alt);

-- ─── Beekeeper products ───────────────────────────────────────────────────────

INSERT INTO beekeeper_products (
  slug, name, product_type, description, full_description,
  breeds, season_note, is_featured, status, display_order,
  image_url, image_alt
) VALUES
(
  'bee-packages',
  'Бджолопакети',
  'bee_packages',
  'Бджолопакети порід Buckfast та Карніка. Спокійні, продуктивні породи.',
  'Бджолопакети вирощені на власній пасіці. Відрізняються спокійним характером та стійкістю до хвороб. Доступні з квітня по червень. Ціна залежить від породи та сезону — уточнюйте заздалегідь.',
  ARRAY['Buckfast', 'Карніка'],
  'Доступні з квітня по червень',
  false, 'available', 1,
  NULL, 'Бджолопакети Дача TV'
),
(
  'bee-colonies',
  'Бджолосімʼї',
  'bee_colonies',
  'Повноцінні бджолосімʼї у вуликах. Підходять для початківців і досвідчених пасічників.',
  'Бджолосімʼя — це готова пасічна одиниця: вулик із рамками, розплодом, кормами та плодною маткою. Здаємо разом з вуликом або без — уточнюйте.',
  ARRAY['Buckfast', 'Карніка'],
  'Доступні з квітня по серпень',
  false, 'available', 2,
  NULL, 'Бджолосімʼї Дача TV'
),
(
  'empty-hives',
  'Порожні вулики',
  'empty_hives',
  'Порожні вулики для самостійного заселення. Уточнюйте наявність та конструкцію.',
  'Пропонуємо вулики типу Дадан та багатокорпусні. Виготовлені з дерева, без обробки хімікатами. Ціна залежить від комплектації та кількості.',
  NULL,
  NULL,
  false, 'available', 3,
  NULL, 'Порожні вулики Дача TV'
),
(
  'swarm-lure',
  'Приманка для роїв',
  'apiary_supply',
  'Приманка для роїв використовується в сезон роїння для підвищення шансів заселення пастки або підготовленого вулика. Зручний формат банки дозволяє легко використовувати продукт у практичній роботі на пасіці.',
  'Натуральна приманка на основі воску та ефірних олій з нашої пасіки. Наноситься на внутрішні стінки вулика-пастки перед сезоном роїння. Суттєво підвищує шанси заселення рою. Об''єм: 30–50 мл.',
  NULL,
  'Сезон роїння: квітень–липень',
  true, 'available', 4,
  NULL, 'Приманка для роїв Дача TV'
),
(
  'wax-foundation',
  'Вощина Dacha TV',
  'apiary_supply',
  'Натуральна бджолиновощина з якісного бджолиного воску. Підходить для стандартних рамок Дадан та інших типів вуликів.',
  'Вощина виготовлена з 100% натурального бджолиного воску власного виробництва. Осередки правильної форми — 5,4 мм. Аркуш 410 × 260 мм, підходить для рамки Дадан-12. Пакується по 10 аркушів.',
  NULL,
  NULL,
  false, 'available', 5,
  NULL, 'Вощина Дача TV'
)
ON CONFLICT (slug) DO UPDATE SET
  name            = COALESCE(NULLIF(beekeeper_products.name, ''), EXCLUDED.name),
  description     = COALESCE(beekeeper_products.description, EXCLUDED.description),
  full_description = COALESCE(beekeeper_products.full_description, EXCLUDED.full_description),
  product_type    = COALESCE(beekeeper_products.product_type, EXCLUDED.product_type),
  breeds          = COALESCE(beekeeper_products.breeds, EXCLUDED.breeds),
  season_note     = COALESCE(beekeeper_products.season_note, EXCLUDED.season_note),
  status          = COALESCE(beekeeper_products.status, EXCLUDED.status),
  image_alt       = COALESCE(beekeeper_products.image_alt, EXCLUDED.image_alt);

-- ─── Flower products (50 chrysanthemum varieties) ────────────────────────────

INSERT INTO flower_products (
  slug, name, category, variety, short_description, full_description,
  price_uah, color, bloom_season, height_cm, lighting, packaging_note,
  display_order, is_featured, status, image_url, image_alt
) VALUES
-- Помпонові
('anastasia-white','Anastasia White','chrysanthemum','Помпонова','Класична помпонова хризантема з сніжно-білими суцвіттями. Один із найпопулярніших сортів для зрізу.','Компактні кулясті суцвіття діаметром 4–6 см. Довга ваза — до 14 днів. Ідеальна для букетів і весільних композицій.',75,'Білий','Вересень–Жовтень',65,'Сонце','Укорінений живець або паросток',1,true,'available',NULL,'Anastasia White — біла помпонова хризантема'),
('malynovyi-zakhid','Малиновий захід','chrysanthemum','Помпонова','Яскраво-малинові кульки з легким перламутровим відливом. Сорт стійкий до осінніх дощів.','Висота куща до 60 см, рясне цвітіння. Відмінно підходить для вазонного вирощування і клумб.',80,'Малиновий','Жовтень',60,'Сонце','Укорінений живець',2,true,'available',NULL,'Малиновий захід — малинова помпонова хризантема'),
('zolota-osin','Золота осінь','chrysanthemum','Помпонова','Соковито-жовті суцвіття на міцних стеблах. Класика осіннього саду.',NULL,70,'Жовтий','Вересень–Жовтень',55,'Сонце',NULL,3,false,'available',NULL,NULL),
('snezhynka','Сніжинка','chrysanthemum','Помпонова','Дрібні білі суцвіття з кремовим центром. Ніжний, «хмарний» вигляд.',NULL,70,'Білий/Кремовий','Жовтень',50,'Сонце',NULL,4,false,'available',NULL,NULL),
('bronzova','Бронзова','chrysanthemum','Помпонова','Мідно-бронзовий відтінок із переходом у теракоту. Модна осіння палітра.',NULL,75,'Бронзовий','Жовтень',60,'Сонце',NULL,5,false,'available',NULL,NULL),
('lilovyi-son','Ліловий сон','chrysanthemum','Помпонова','Пастельно-ліловий колір, що підсилюється на прохолоді. Чарівна осіння квітка.',NULL,80,'Ліловий','Жовтень',55,'Сонце',NULL,6,false,'available',NULL,NULL),
('rozheva-khmara','Рожева хмара','chrysanthemum','Помпонова','Ніжно-рожеві кульки, дуже рясне цвітіння. Чудово виглядає в масових посадках.',NULL,75,'Рожевий','Вересень–Жовтень',55,'Сонце',NULL,7,false,'available',NULL,NULL),
('oranzeva-iskra','Оранжева іскра','chrysanthemum','Помпонова','Яскраво-помаранчеві суцвіття — справжня окраса осіннього саду.',NULL,70,'Помаранчевий','Жовтень',50,'Сонце',NULL,8,false,'available',NULL,NULL),
('temno-chervona','Темно-червона','chrysanthemum','Помпонова','Насичено-бордовий колір із оксамитовою текстурою пелюсток.',NULL,80,'Бордо/Темно-червоний','Жовтень',60,'Сонце',NULL,9,false,'available',NULL,NULL),
-- Кущові
('baltyka-zhovta','Балтика Жовта','chrysanthemum','Кущова','Кущова хризантема з яскраво-жовтими суцвіттями середнього розміру. Зимостійка.','Кущ розгалужений, висотою до 70 см. Суцвіття 6–8 см, щільні, довго тримаються у вазі.',85,'Жовтий','Вересень–Жовтень',70,'Сонце','Укорінений живець',10,true,'available',NULL,'Балтика Жовта — кущова хризантема'),
('baltyka-bila','Балтика Біла','chrysanthemum','Кущова','Білосніжна кущова хризантема — класика для зрізу та клумб.',NULL,85,'Білий','Вересень–Жовтень',70,'Сонце',NULL,11,false,'available',NULL,NULL),
('baltyka-rozheva','Балтика Рожева','chrysanthemum','Кущова','Ніжно-рожеві суцвіття з кремовим центром. Популярна в осінніх букетах.',NULL,85,'Рожевий','Вересень–Жовтень',70,'Сонце',NULL,12,false,'available',NULL,NULL),
('karmen','Кармен','chrysanthemum','Кущова','Малинові суцвіття з темнішим центром. Назва говорить сама за себе — пристрасна й виразна.',NULL,90,'Малиново-бордовий','Жовтень',65,'Сонце',NULL,13,false,'available',NULL,NULL),
('zoriana-nich','Зоряна ніч','chrysanthemum','Кущова','Темно-фіолетові суцвіття зі срібним відтінком. Ефектна квітка для контрастних композицій.',NULL,90,'Фіолетовий','Жовтень',60,'Сонце',NULL,14,false,'available',NULL,NULL),
('soniachnyi-promin','Сонячний промінь','chrysanthemum','Кущова','Яскраво-жовтогарячі суцвіття, стійкість до дощу та вітру. Незамінна на клумбі.',NULL,80,'Жовтогарячий','Вересень–Жовтень',65,'Сонце',NULL,15,false,'available',NULL,NULL),
('persykova','Персикова','chrysanthemum','Кущова','Персиково-абрикосовий відтінок, що рідко зустрічається у кущових хризантем.',NULL,90,'Персиковий','Жовтень',60,'Сонце',NULL,16,false,'available',NULL,NULL),
('zelenyi-chai','Зелений чай','chrysanthemum','Кущова','Незвичайна хризантема з салатово-зеленими суцвіттями. Оригінально виглядає в букеті.',NULL,95,'Зелений','Жовтень',65,'Сонце',NULL,17,false,'available',NULL,NULL),
('krem-briule','Крем-брюле','chrysanthemum','Кущова','Кремово-вершковий тон із легким рожевим підтоном. Витончена й ніжна.',NULL,85,'Кремовий','Вересень–Жовтень',60,'Сонце',NULL,18,false,'available',NULL,NULL),
('terakota','Теракота','chrysanthemum','Кущова','Земляний теракотово-іржавий колір — актуальний тренд флористики.',NULL,90,'Теракота','Жовтень',65,'Сонце',NULL,19,false,'available',NULL,NULL),
-- Великоквіткові
('bila-perlyna','Біла перлина','chrysanthemum','Великоквіткова','Одностеблова хризантема з великою квіткою діаметром 16–20 см. Ідеальна для показових букетів.','Класична великоквіткова хризантема для зрізу. Утворює одну велику квітку на стеблі. Потребує пасинкування.',110,'Білий','Жовтень–Листопад',90,'Сонце','Укорінений живець',20,true,'available',NULL,'Біла перлина — великоквіткова хризантема'),
('zolotyi-lev','Золотий лев','chrysanthemum','Великоквіткова','Золотисто-жовта великоквіткова хризантема з щільними пелюстками. Виставковий сорт.',NULL,120,'Золотисто-жовтий','Жовтень–Листопад',95,'Сонце',NULL,21,false,'available',NULL,NULL),
('rozhevyi-zakhid','Рожевий захід','chrysanthemum','Великоквіткова','Ніжно-рожева квітка з інтенсивнішим кольором у центрі. Виглядає розкішно.',NULL,115,'Рожевий','Жовтень',90,'Сонце',NULL,22,false,'available',NULL,NULL),
('burhunskyi-oksemyt','Бургундський оксамит','chrysanthemum','Великоквіткова','Глибокий бургундський колір із оксамитовою текстурою. Розкіш для осіннього букету.',NULL,125,'Бургундський','Жовтень–Листопад',95,'Сонце',NULL,23,false,'available',NULL,NULL),
('pomaranch','Помаранч','chrysanthemum','Великоквіткова','Яскраво-помаранчева квітка великого розміру. Привертає увагу здалеку.',NULL,110,'Помаранчевий','Жовтень',85,'Сонце',NULL,24,false,'available',NULL,NULL),
('kremova-rehina','Кремова регіна','chrysanthemum','Великоквіткова','Кремово-білий колір із ледь помітним лимонним відтінком у центрі.',NULL,115,'Кремовий','Жовтень–Листопад',90,'Сонце',NULL,25,false,'available',NULL,NULL),
('sriblaste-siaivo','Сріблясте сяйво','chrysanthemum','Великоквіткова','Сріблясто-бузковий відтінок з виразним виставковим виглядом.',NULL,130,'Сріблясто-бузковий','Листопад',100,'Сонце',NULL,26,false,'available',NULL,NULL),
-- Дрібноквіткові
('bila-zirochka','Біла зірочка','chrysanthemum','Дрібноквіткова','Безліч дрібних білих ромашкоподібних квіток на одному кущі. Витончено й легко.','Утворює хмарку з квіток діаметром 2–3 см. Чудово виглядає в масових посадках і живоплотах.',65,'Білий','Вересень–Жовтень',50,'Сонце',NULL,27,false,'available',NULL,NULL),
('rozhevyi-doshch','Рожевий дощ','chrysanthemum','Дрібноквіткова','Ніжні рожеві суцвіття розміром з монетку. Рясне довготривале цвітіння.',NULL,65,'Рожевий','Вересень–Жовтень',45,'Сонце',NULL,28,false,'available',NULL,NULL),
('medova-kraplia','Медова крапля','chrysanthemum','Дрібноквіткова','Медово-жовті дрібні квітки. Невибаглива у догляді, стійка до морозів.',NULL,65,'Медово-жовтий','Жовтень',45,'Сонце',NULL,29,false,'available',NULL,NULL),
('lavandovyi-tuman','Лавандовий туман','chrysanthemum','Дрібноквіткова','Лавандові дрібні квітки зі срібним відблиском. Незвична кольорова гама.',NULL,70,'Лавандовий','Жовтень',50,'Сонце',NULL,30,false,'available',NULL,NULL),
('pomarancheva-feieriia','Помаранчева феєрія','chrysanthemum','Дрібноквіткова','Соковито-помаранчеві дрібні квіти — яскрава пляма на клумбі в жовтні.',NULL,65,'Помаранчевий','Жовтень',45,'Сонце',NULL,31,false,'available',NULL,NULL),
-- Компактні
('minaret-bilyi','Мінарет Білий','chrysanthemum','Компактна','Компактний кущ висотою до 35 см з рясними білими суцвіттями. Ідеальна для вазонів.','Не потребує пасинкування. Відмінно розростається в горщиках і контейнерах на балконі.',75,'Білий','Жовтень',35,'Сонце','Укорінений живець',32,false,'available',NULL,'Мінарет Білий — компактна хризантема'),
('minaret-rozhevyi','Мінарет Рожевий','chrysanthemum','Компактна','Рожева компактна хризантема — маленька, але дуже рясноцвіта.',NULL,75,'Рожевий','Жовтень',35,'Сонце',NULL,33,false,'available',NULL,NULL),
('minaret-zhovtyi','Мінарет Жовтий','chrysanthemum','Компактна','Жовта компактна форма. Невибаглива, морозостійка, підходить для новачків.',NULL,70,'Жовтий','Жовтень',30,'Сонце',NULL,34,false,'available',NULL,NULL),
('balkon-laim','Балкон Лайм','chrysanthemum','Компактна','Салатово-лаймовий колір, компактний кущ — хіт для балконних вазонів.',NULL,80,'Салатовий/Лайм','Жовтень',30,'Сонце',NULL,35,false,'available',NULL,NULL),
-- Анемонові
('anemon-rozhevyi','Анемон Рожевий','chrysanthemum','Анемонова','Характерна будова квітки: плоскі зовнішні пелюстки й опукле центральне вічко. Унікально.','Анемоновидна хризантема виглядає як два квіти в одному. Пухнастий центр гармоніює з плоскими крайовими пелюстками.',90,'Рожевий','Вересень–Жовтень',60,'Сонце',NULL,36,false,'available',NULL,NULL),
('anemon-bilyi','Анемон Білий','chrysanthemum','Анемонова','Білі пелюстки та жовто-зелений центр. Нагадує велику ромашку з характером.',NULL,90,'Білий/Жовтий центр','Жовтень',55,'Сонце',NULL,37,false,'available',NULL,NULL),
('anemon-bronza','Анемон Бронза','chrysanthemum','Анемонова','Бронзово-помаранчеві крайові пелюстки та густий рудий центр. Незвична осіння краса.',NULL,95,'Бронзово-помаранчевий','Жовтень',60,'Сонце',NULL,38,false,'available',NULL,NULL),
-- Павукоподібні
('pavuk-zhovtyi','Павук Жовтий','chrysanthemum','Павукоподібна','Довгі закручені пелюстки золотисто-жовтого кольору. Екзотичний вигляд, яскравий акцент.','Spider (павукоподібна) хризантема з трубчастими звивистими пелюстками 10–15 см. Діаметр квітки до 25 см.',120,'Золотисто-жовтий','Жовтень–Листопад',100,'Сонце','Укорінений живець',39,true,'available',NULL,'Павук Жовтий — павукоподібна хризантема'),
('pavuk-bilyi','Павук Білий','chrysanthemum','Павукоподібна','Крученопелюсткова хризантема в молочно-білому кольорі. Ефектна у флористиці.',NULL,120,'Молочно-білий','Жовтень–Листопад',95,'Сонце',NULL,40,false,'available',NULL,NULL),
('pavuk-lilovyi','Павук Ліловий','chrysanthemum','Павукоподібна','Ліловий spider — рідкісний та ефектний. Виставковий сорт.',NULL,130,'Ліловий','Листопад',100,'Сонце',NULL,41,false,'available',NULL,NULL),
-- Двоколірні
('yahuar','Ягуар','chrysanthemum','Помпонова','Жовті пелюстки з червоно-бронзовими кінчиками. Кожна квітка виглядає унікально.',NULL,85,'Жовтий/Бронзовий','Жовтень',60,'Сонце',NULL,42,false,'available',NULL,NULL),
('khameleon','Хамелеон','chrysanthemum','Кущова','Колір змінюється з рожевого до кораловогоо залежно від температури. Унікальний сорт.',NULL,95,'Рожево-кораловий','Жовтень',65,'Сонце',NULL,43,false,'available',NULL,NULL),
('flaminho','Фламінго','chrysanthemum','Великоквіткова','Рожево-помаранчевий градієнт від центру до кінців пелюсток. Ефектна для виставок.',NULL,125,'Рожево-помаранчевий','Жовтень–Листопад',90,'Сонце',NULL,44,false,'available',NULL,NULL),
('leopard','Леопард','chrysanthemum','Помпонова','Білі пелюстки з рожево-малиновим штрихуванням. Незвичайний, «плямистий» ефект.',NULL,85,'Білий/Рожевий','Жовтень',55,'Сонце',NULL,45,false,'available',NULL,NULL),
-- Пізні
('sybirska-krasunіa','Сибірська красуня','chrysanthemum','Кущова','Надзвичайно морозостійкий сорт — цвіте навіть після легких морозів. Для відкритого ґрунту.',NULL,90,'Рожево-ліловий','Жовтень–Листопад',70,'Сонце',NULL,46,false,'available',NULL,NULL),
('zymovyi-sad','Зимовий сад','chrysanthemum','Помпонова','Пізньоцвітний сорт — найдовше залишається в саду. Стійкий до заморозків до -7°C.',NULL,80,'Білий/Кремовий','Листопад',55,'Сонце',NULL,47,false,'available',NULL,NULL),
('piznia-osin','Пізня осінь','chrysanthemum','Кущова','Насичено-бордові суцвіття в кінці сезону. Останній барвистий акорд саду.',NULL,85,'Бордо','Листопад',65,'Сонце',NULL,48,false,'available',NULL,NULL),
-- Ексклюзивні
('shokoladna','Шоколадна','chrysanthemum','Помпонова','Темно-шоколадний, майже коричневий відтінок. Дуже рідкісна й затребувана флористами.',NULL,100,'Шоколадний/Коричневий','Жовтень',60,'Сонце',NULL,49,true,'available',NULL,NULL),
('holuba-mriia','Голуба мрія','chrysanthemum','Великоквіткова','Бузково-блакитний відтінок — одна з найрідкісніших барв у хризантем. Колекційний сорт.','Дуже рідкісна забарвлення для хризантеми. Квітка утворює один великий бутон діаметром до 18 см. Використовується на виставках.',130,'Бузково-блакитний','Жовтень–Листопад',95,'Сонце','Укорінений живець (обмежена кількість)',50,true,'available',NULL,'Голуба мрія — рідкісна велика хризантема')
ON CONFLICT (slug) DO UPDATE SET
  name              = COALESCE(NULLIF(flower_products.name, ''), EXCLUDED.name),
  variety           = COALESCE(flower_products.variety, EXCLUDED.variety),
  short_description = COALESCE(flower_products.short_description, EXCLUDED.short_description),
  full_description  = COALESCE(flower_products.full_description, EXCLUDED.full_description),
  price_uah         = COALESCE(flower_products.price_uah, EXCLUDED.price_uah),
  color             = COALESCE(flower_products.color, EXCLUDED.color),
  bloom_season      = COALESCE(flower_products.bloom_season, EXCLUDED.bloom_season),
  height_cm         = COALESCE(flower_products.height_cm, EXCLUDED.height_cm),
  lighting          = COALESCE(flower_products.lighting, EXCLUDED.lighting),
  packaging_note    = COALESCE(flower_products.packaging_note, EXCLUDED.packaging_note),
  status            = COALESCE(flower_products.status, EXCLUDED.status),
  image_alt         = COALESCE(flower_products.image_alt, EXCLUDED.image_alt);
