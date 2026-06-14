-- Migration 057: Approved lavender wording.
--
-- Replaces "сімейних пікніків" / "прогулянок серед рядів квітучої лаванди" /
-- "прогулянки або пікніку" with the approved phrasing
-- "освітніх, культурних і оздоровчих заходів" on the lavender service, so the
-- /services card and structured data match the /lavender page copy.
--
-- Idempotent — safe to re-run.

UPDATE services SET
  short_description = 'Фотосесії, освітні, культурні й оздоровчі заходи на лавандовому полі — погодинна оренда 06:00–21:00.',
  description = 'Орендуйте лавандове поле на нашій садибі для фотосесій, освітніх, культурних і оздоровчих заходів. Вартість включає 5 осіб, кожна додаткова — 200 ₴. Сезон цвітіння: червень–липень.'
WHERE slug = 'orenda-lavandovoho-polia';
