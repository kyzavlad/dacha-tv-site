-- Migration 035: Services table + seed
-- Fully idempotent — safe to re-run at any time.

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  short_description text,
  description text,
  price_uah numeric,
  price_note text,
  duration_note text,
  status text not null default 'active' check (status in ('active', 'inactive')),
  is_featured boolean not null default false,
  display_order integer not null default 0,
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed the 3 initial services — safe to re-run (ON CONFLICT DO NOTHING)
insert into services (name, slug, short_description, description, price_uah, price_note, duration_note, status, is_featured, display_order) values
(
  'Фотосесія у лаванді',
  'fotosesiia-lavandove-pole',
  'Незабутні знімки на тлі квітучої лаванди на нашій садибі.',
  'Проведіть фотосесію серед рядів квітучої лаванди на садибі Дача TV. Ідеально для сімейних знімків, лавстрі та особистих брендових фото. Ми надаємо локацію, а ви приводите свого фотографа або замовляєте через нас. Сезон — червень–липень.',
  1000,
  '₴1000 / година',
  'Від 1 години',
  'active',
  true,
  1
),
(
  'Альтанка на воді',
  'orenda-altanky-na-vodi',
  'Затишна альтанка над ставком — для відпочинку, пікніка або особливого вечора.',
  'Орендуйте нашу альтанку на воді для романтичного вечора, сімейного відпочинку або невеликого святкування. Альтанка розташована над тихим ставком у тіні дерев. Вміщує до 8 осіб. Безкоштовна риболовля включена.',
  3000,
  '₴3000 / доба',
  'Від 1 доби',
  'active',
  true,
  2
),
(
  'Послуги пасічника',
  'posluhy-pasisnyka',
  'Консультація, обслуговування вуликів і практична допомога від досвідченого пасічника.',
  'Наш пасічник з багаторічним досвідом допоможе з оглядом і обслуговуванням вуликів, консультацією щодо розведення бджіл, лікуванням сімей та підготовкою до зими. Послуги надаються на вашій або нашій пасіці.',
  null,
  'Ціна за домовленістю',
  'За домовленістю',
  'active',
  false,
  3
)
on conflict (slug) do nothing;
