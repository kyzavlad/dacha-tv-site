-- Migration 043: Deactivate old duplicate services, add honey chocolate product.
-- Idempotent — safe to re-run.

-- ─── Deactivate old duplicate services ───────────────────────────────────────
-- These are replaced by orenda-lavandovoho-polia and orenda-budynochka-na-vodi
-- (migration 042). Slugs are preserved so existing URLs return the detail page.

update services
  set status = 'inactive'
  where slug in ('fotosesiia-lavandove-pole', 'orenda-altanky-na-vodi');

-- ─── Add honey chocolate to apiary_products ───────────────────────────────────

insert into apiary_products (
  slug,
  name,
  short_description,
  description,
  full_description,
  composition,
  usage_notes,
  storage_info,
  packaging_note,
  price_uah,
  weight_g,
  is_featured,
  status,
  display_order,
  image_url,
  image_alt
) values (
  'medovyi-shokolad',
  'Медовий шоколад',

  'Домашній шоколад на основі какао та меду з власної пасіки. Без цукру — натуральний смак, живий склад.',

  $desc$Справжній домашній шоколад, приготований на водяній бані з какао від виробників Африки, Венесуели та Перу. Замість цукру — мед з нашої пасіки. Готуємо асорті: сухофрукти з ягодами, горіховий мікс або конкретний наповнювач на замовлення — курага, манго, полуниця, родзинки, горіхи.$desc$,

  $full$Справжній домашній шоколад, приготований на водяній бані з какао найвищої якості від виробників Африки, Венесуели та Перу. Замість цукру — мед з нашої пасіки.

Приготування на водяній бані при помірному вогні зберігає всі корисні речовини какао і меду. Без штучних підсолоджувачів, ароматизаторів і замінників.

Варіанти наповнення:
• Мікс сухофруктів і ягід
• Горіховий мікс
• За замовленням: курага, манго, полуниця, родзинки, фундук, мигдаль, волоський горіх

Підходить як подарунок або витончений десерт. Зв''яжіться з нами — оберемо склад і кількість.$full$,

  'Какао-продукти (Африка, Венесуела, Перу), мед натуральний з власної пасіки, наповнювачі: сухофрукти, ягоди, горіхи (склад залежить від виду)',

  'Зберігати в прохолодному сухому місці, подалі від прямих сонячних променів. Оптимальна температура: +16…+18 °C.',

  'Термін придатності — до 30 днів при правильному зберіганні.',

  'Плитка 100 г. Можливе подарункове пакування.',

  200,
  100,
  true,
  'available',
  10,
  null,
  'Медовий шоколад Дача TV — домашній, без цукру, з медом з пасіки'
)
on conflict (slug) do update set
  name              = excluded.name,
  short_description = excluded.short_description,
  description       = excluded.description,
  full_description  = excluded.full_description,
  price_uah         = excluded.price_uah,
  status            = excluded.status,
  is_featured       = excluded.is_featured;
