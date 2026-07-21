// ─── Catalog listing UI dictionary (uk canonical, ru, en) ────────────────────
// Static, visible chrome for the catalog LISTING pages: landing, all-products,
// category, plus the sort/filter/pagination/search controls they render. Dynamic
// product & category NAMES come from the DB translation rows — never here.
//
// Usage (server component):
//   const locale = await getRequestLocale()
//   const t = catalogDict(locale)
//   <h1>{t.landingTitle}</h1>
//
// Client controls ('use client') accept a `locale?` prop (default uk) and call
// catalogDict(locale) themselves; the parent server page passes locale down.

import type { Locale } from '@/lib/i18n'
import { tr, type Tr } from '@/lib/i18n/pages'

const D = {
  // Shared crumbs / words
  crumbHome: { uk: 'Головна', ru: 'Главная', en: 'Home' },
  crumbCatalog: { uk: 'Каталог', ru: 'Каталог', en: 'Catalog' },
  items: { uk: 'товарів', ru: 'товаров', en: 'products' },
  pageWord: { uk: 'сторінка', ru: 'страница', en: 'page' },
  pageWordCap: { uk: 'Сторінка', ru: 'Страница', en: 'Page' },
  of: { uk: 'з', ru: 'из', en: 'of' },
  prev: { uk: 'Попередня', ru: 'Предыдущая', en: 'Previous' },
  next: { uk: 'Наступна', ru: 'Следующая', en: 'Next' },

  // ── Landing (app/catalog/page.tsx) ──
  eyebrowShop: { uk: 'Магазин', ru: 'Магазин', en: 'Shop' },
  landingTitle: {
    uk: 'Товари для дому, саду та господарства',
    ru: 'Товары для дома, сада и хозяйства',
    en: 'Goods for home, garden and household',
  },
  landingSubtitle: {
    uk: 'Товари для дому, саду та дачного господарства. Якість перевірена: доставка по Україні.',
    ru: 'Товары для дома, сада и дачного хозяйства. Качество проверено: доставка по Украине.',
    en: 'Goods for the home, garden and country house. Quality checked: delivery across Ukraine.',
  },
  allAssortmentTitle: { uk: 'Весь асортимент', ru: 'Весь ассортимент', en: 'The full range' },
  allAssortmentBody: {
    uk: 'Перегляньте всі товари одним списком — з пошуком, сортуванням і фільтрами.',
    ru: 'Просмотрите все товары одним списком — с поиском, сортировкой и фильтрами.',
    en: 'Browse every product in one list — with search, sorting and filters.',
  },
  allProductsCta: { uk: 'Усі товари →', ru: 'Все товары →', en: 'All products →' },
  categoriesTitle: { uk: 'Категорії товарів', ru: 'Категории товаров', en: 'Product categories' },
  categoriesChipLabel: { uk: 'Категорії', ru: 'Категории', en: 'Categories' },
  faqHeading: {
    uk: 'Поширені запитання про магазин',
    ru: 'Частые вопросы о магазине',
    en: 'Common questions about the shop',
  },

  // Synthetic "browse everything" category card
  allProductsCardTitle: { uk: 'Усі товари', ru: 'Все товары', en: 'All products' },
  allProductsCardDesc: {
    uk: 'Перегляньте весь асортимент магазину одним списком.',
    ru: 'Просмотрите весь ассортимент магазина одним списком.',
    en: 'Browse the shop’s entire range in one list.',
  },

  // Empty-categories fallback block
  emptyAllTitle: { uk: 'Усі товари', ru: 'Все товары', en: 'All products' },
  emptyAllBody: {
    uk: 'Перегляньте весь асортимент одним списком або скористайтеся пошуком вище.',
    ru: 'Просмотрите весь ассортимент одним списком или воспользуйтесь поиском выше.',
    en: 'Browse the whole range in one list or use the search above.',
  },
  emptyAllCta: {
    uk: 'Переглянути всі товари →',
    ru: 'Посмотреть все товары →',
    en: 'View all products →',
  },

  // ── Search view (app/catalog/page.tsx, ?q=) ──
  searchTitle: { uk: 'Пошук у магазині', ru: 'Поиск в магазине', en: 'Search the shop' },
  resultsFor: { uk: 'Результати за запитом', ru: 'Результаты по запросу', en: 'Results for' },
  nothingFoundFor: {
    uk: 'Нічого не знайдено за запитом',
    ru: 'Ничего не найдено по запросу',
    en: 'Nothing found for',
  },
  searchHintBefore: {
    uk: 'Спробуйте коротший або інший запит, перевірте написання, або шукайте за артикулом. Також перегляньте категорії вище чи',
    ru: 'Попробуйте более короткий или другой запрос, проверьте написание или ищите по артикулу. Также посмотрите категории выше или',
    en: 'Try a shorter or different query, check the spelling, or search by SKU. You can also browse the categories above or',
  },
  allProductsLower: { uk: 'усі товари', ru: 'все товары', en: 'all products' },

  // ── All-products page (app/catalog/all/page.tsx) ──
  allTitle: { uk: 'Усі товари', ru: 'Все товары', en: 'All products' },
  emptyNoProducts: {
    uk: 'Товарів поки немає.',
    ru: 'Товаров пока нет.',
    en: 'No products yet.',
  },

  // ── Filter chips (category page) ──
  onlyWithPrice: { uk: 'Тільки з ціною', ru: 'Только с ценой', en: 'With price only' },
  onlyWithPhoto: { uk: 'Тільки з фото', ru: 'Только с фото', en: 'With photo only' },

  // ── Sort control (components/catalog/CatalogSortSelect.tsx) ──
  sortPrefix: { uk: 'Сортувати:', ru: 'Сортировать:', en: 'Sort:' },
  sortAria: { uk: 'Сортувати товари', ru: 'Сортировать товары', en: 'Sort products' },
  sortFeatured: { uk: 'Рекомендовані', ru: 'Рекомендуемые', en: 'Featured' },
  sortPriceAsc: { uk: 'Спочатку дешевші', ru: 'Сначала дешевле', en: 'Cheapest first' },
  sortPriceDesc: { uk: 'Спочатку дорожчі', ru: 'Сначала дороже', en: 'Most expensive first' },
  sortNewest: { uk: 'Новинки', ru: 'Новинки', en: 'New arrivals' },
  sortName: { uk: 'За назвою (А–Я)', ru: 'По названию (А–Я)', en: 'By name (A–Z)' },

  // ── Search bar (components/catalog/CatalogSearchBar.tsx) ──
  searchPlaceholder: {
    uk: 'Пошук товарів за назвою або артикулом…',
    ru: 'Поиск товаров по названию или артикулу…',
    en: 'Search products by name or SKU…',
  },
  searchAria: { uk: 'Пошук товарів', ru: 'Поиск товаров', en: 'Search products' },
  searchButton: { uk: 'Знайти', ru: 'Найти', en: 'Search' },
  showAllResults: {
    uk: 'Показати всі результати →',
    ru: 'Показать все результаты →',
    en: 'Show all results →',
  },
} satisfies Record<string, Tr>

export function catalogDict(locale: Locale) {
  const out = {} as Record<keyof typeof D, string>
  for (const k in D) out[k as keyof typeof D] = tr(D[k as keyof typeof D], locale)
  return out
}

// Map a CatalogSort value → localized label key. Keeps sort keys/logic untouched.
export function catalogSortLabel(
  t: ReturnType<typeof catalogDict>,
  value: string,
): string {
  switch (value) {
    case 'price_asc': return t.sortPriceAsc
    case 'price_desc': return t.sortPriceDesc
    case 'newest': return t.sortNewest
    case 'name': return t.sortName
    default: return t.sortFeatured
  }
}

// Raw dictionary for tooling / coverage tests.
export const RAW_CATALOG_DICT = D
