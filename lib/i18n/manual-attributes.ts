import type { Locale } from '@/lib/i18n'

const RU_FLOWER_VARIETY: Record<string, string> = {
  'Голчаста': 'Игольчатая',
  'Корейська': 'Корейская',
  'Кущова': 'Кустовая',
  'Мультифлора': 'Мультифлора',
  'Одноголова': 'Одноголовая',
  'Павукоподібна': 'Паукообразная',
  'Помпонова': 'Помпонная',
  'Ромашкова': 'Ромашковая',
  'Сантіні': 'Сантини',
  'Великоквіткова': 'Крупноцветковая',
  'Дрібноквіткова': 'Мелкоцветковая',
  'Компактна': 'Компактная',
  'Анемонова': 'Анемоновидная',
}

const RU_FLOWER_COLOR: Record<string, string> = {
  'Білий': 'Белый',
  'Бордовий': 'Бордовый',
  'Бронзовий': 'Бронзовый',
  'Бузковий': 'Сиреневый',
  'Жовтий': 'Жёлтый',
  'Зелений': 'Зелёный',
  'Кремовий': 'Кремовый',
  'Лаймовий': 'Лаймовый',
  'Ліловий': 'Лиловый',
  'Малиновий': 'Малиновый',
  'Оранжевий': 'Оранжевый',
  'Помаранчевий': 'Оранжевый',
  'Рожевий': 'Розовый',
  'Рубіновий': 'Рубиновый',
  'Темно-червоний': 'Тёмно-красный',
  'Фіолетовий': 'Фиолетовый',
  'Фіолетово-бордовий': 'Фиолетово-бордовый',
  'Червоний': 'Красный',
}

const RU_FLOWER_BLOOM: Record<string, string> = {
  'Вересень–Жовтень': 'Сентябрь–Октябрь',
  'Жовтень': 'Октябрь',
}

const RU_FLOWER_LIGHTING: Record<string, string> = {
  'Сонце': 'Солнце',
  'Сонце / напівтінь': 'Солнце / полутень',
}

const RU_BEEKEEPER_SEASON: Record<string, string> = {
  'Доступні з квітня по серпень': 'Доступны с апреля по август',
  'Доступні з квітня по червень': 'Доступны с апреля по июнь',
  'Наявність залежить від сезону': 'Наличие зависит от сезона',
  'Сезон роїння: квітень–липень': 'Сезон роения: апрель–июль',
}

const RU_APIARY_PACKAGING: Record<string, string> = {
  'пляшка': 'бутылка',
  'фасування уточнюйте': 'фасовку уточняйте',
}

function localizeKnown(value: string | null | undefined, locale: Locale, ru: Record<string, string>): string {
  const clean = (value ?? '').trim()
  if (!clean || locale !== 'ru') return clean
  return ru[clean] ?? clean
}

export function localizeFlowerVariety(value: string | null | undefined, locale: Locale): string {
  return localizeKnown(value, locale, RU_FLOWER_VARIETY)
}

export function localizeFlowerColor(value: string | null | undefined, locale: Locale): string {
  return localizeKnown(value, locale, RU_FLOWER_COLOR)
}

export function localizeFlowerBloomSeason(value: string | null | undefined, locale: Locale): string {
  return localizeKnown(value, locale, RU_FLOWER_BLOOM)
}

export function localizeFlowerLighting(value: string | null | undefined, locale: Locale): string {
  return localizeKnown(value, locale, RU_FLOWER_LIGHTING)
}

export function localizeBeekeeperSeasonNote(value: string | null | undefined, locale: Locale): string {
  return localizeKnown(value, locale, RU_BEEKEEPER_SEASON)
}

export function localizeApiaryPackaging(value: string | null | undefined, locale: Locale): string {
  return localizeKnown(value, locale, RU_APIARY_PACKAGING)
}
