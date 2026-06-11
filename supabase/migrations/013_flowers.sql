-- Migration 013: Flowers catalog
-- Creates flower_products table and seeds 6 chrysanthemum entries.

CREATE TABLE IF NOT EXISTS flower_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text UNIQUE NOT NULL,
  category      text NOT NULL DEFAULT 'chrysanthemum',
  variety       text,
  short_description text,
  full_description  text,
  price_uah     numeric(10,2),
  color         text,
  bloom_season  text,
  height_cm     int,
  lighting      text,
  packaging_note text,
  display_order int NOT NULL DEFAULT 10,
  is_featured   boolean NOT NULL DEFAULT false,
  in_stock      boolean NOT NULL DEFAULT true,
  image_url     text,
  image_alt     text,
  youtube_video_url text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE flower_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read flower_products"
  ON flower_products FOR SELECT USING (true);

-- 6 sample chrysanthemum entries
INSERT INTO flower_products
  (name, slug, category, variety, short_description, full_description,
   price_uah, color, bloom_season, height_cm, lighting,
   display_order, is_featured, in_stock, image_alt)
VALUES
(
  'Хризантема Бронзова осінь',
  'chrysanthemum-bronze-autumn',
  'chrysanthemum',
  'Помпонова',
  'Насичений бронзово-помаранчевий. Довго тримається у вазі — до 3 тижнів.',
  'Помпонова хризантема з квітками діаметром 3–4 см, суцвіття щільні. Ідеальна для букетів і живоплотів. Зимостійка, невибаглива.',
  85,
  'Бронзово-помаранчевий',
  'Вересень — жовтень',
  50,
  'Повне сонце / Напівтінь',
  1, true, true,
  'Хризантема Бронзова осінь — пасіка Дача TV'
),
(
  'Хризантема Перлина',
  'chrysanthemum-pearl',
  'chrysanthemum',
  'Помпонова',
  'Ніжно-біла з кремовою серцевиною. Класика для весільних і ділових букетів.',
  'Дрібноквіткова помпонова хризантема з квітками 3 см. Дуже довге цвітіння — від 6 до 8 тижнів. Ідеальна як зрізаний матеріал і для контейнерів.',
  80,
  'Білий / Кремовий',
  'Серпень — жовтень',
  45,
  'Повне сонце',
  2, false, true,
  'Хризантема Перлина — пасіка Дача TV'
),
(
  'Хризантема Рожева хмара',
  'chrysanthemum-pink-cloud',
  'chrysanthemum',
  'Кущова',
  'М''який рожевий з перламутровим відтінком. Пишна і об''ємна кущова форма.',
  'Кущова хризантема з дрібними квітками у формі суцвіть. Один кущ утворює до 200 квіток за сезон. Відмінно підходить для живих огорож і масових посадок.',
  90,
  'Рожевий / Перламутровий',
  'Серпень — листопад',
  55,
  'Повне сонце / Напівтінь',
  3, true, true,
  'Хризантема Рожева хмара — пасіка Дача TV'
),
(
  'Хризантема Фіолетовий оксамит',
  'chrysanthemum-violet-velvet',
  'chrysanthemum',
  'Кущова',
  'Глибокий фіолетово-пурпурний. Рідкісний насичений відтінок, виглядає преміально.',
  'Кущова хризантема з насиченим пурпурним кольором пелюсток. Стійка до перших приморозків. Чудово поєднується з білими та золотистими сортами.',
  95,
  'Фіолетовий / Пурпурний',
  'Вересень — жовтень',
  50,
  'Повне сонце',
  4, false, true,
  'Хризантема Фіолетовий оксамит — пасіка Дача TV'
),
(
  'Хризантема Золота куля',
  'chrysanthemum-gold-sphere',
  'chrysanthemum',
  'Помпонова',
  'Яскравий жовто-золотий. Невибаглива, зимостійка, підходить для початківців.',
  'Класична помпонова хризантема жовтого кольору. Одна з найзимостійкіших серед дрібноквіткових. Широко використовується у ландшафтному дизайні.',
  75,
  'Золотисто-жовтий',
  'Вересень — листопад',
  40,
  'Повне сонце',
  5, false, true,
  'Хризантема Золота куля — пасіка Дача TV'
),
(
  'Хризантема Льодяний вітер',
  'chrysanthemum-icy-wind',
  'chrysanthemum',
  'Кущова',
  'Ніжно-ліловий з білим центром. Цвіте до перших морозів, стійка до осінніх дощів.',
  'Пізньоквітуча кущова хризантема. Унікальний двоколірний ефект — лілова облямівка і білий центр. Одна з небагатьох сортів, що цвіте у листопаді.',
  95,
  'Ліловий / Білий',
  'Жовтень — листопад',
  45,
  'Повне сонце / Напівтінь',
  6, false, true,
  'Хризантема Льодяний вітер — пасіка Дача TV'
);
