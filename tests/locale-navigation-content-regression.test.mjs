import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localizeCatalogCategories, localizeCatalogProducts } from '../lib/supabase/catalog.ts'
import { resolveProductSeo } from '../lib/catalog/localized-seo.ts'
import { catalogFaq } from '../lib/catalog-faq.ts'

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('language switch performs an automatic document navigation', () => {
  const src = source('components/shared/LanguageSwitcher.tsx')
  assert.match(src, /window\.location\.assign\(/)
  assert.doesNotMatch(src, /router\.push\(/)
})

test('category cards, chips and search preserve the active locale prefix', () => {
  for (const file of [
    'components/catalog/CategoryCard.tsx',
    'components/catalog/CategoryChips.tsx',
    'components/catalog/CatalogSearchBar.tsx',
  ]) {
    assert.match(source(file), /localizedPath\(locale,/, `${file} must localize navigation`)
  }
})

test('missing RU product translation uses Russian source/generic copy, never UA description', async () => {
  const [product] = await localizeCatalogProducts([{
    id: 'p1',
    supplier_product_id: 'sp1',
    supplier_sku: 'HT-0550',
    name: 'Брусок абразивный',
    name_ua: 'Брусок абразивний',
    slug: 'brusok',
    category_slug: 'abraziv',
    short_description: 'Український опис',
    description: 'Докладний український опис',
    price_uah: 100,
    compare_price_uah: null,
    main_image_url: null,
    images: null,
    attributes: null,
    status: 'published',
    is_featured: false,
    is_price_suspicious: false,
    display_order: 0,
    meta_title: null,
    meta_description: null,
    created_at: '',
    updated_at: '',
  }], 'ru')

  assert.equal(product.localized_name, 'Брусок абразивный')
  assert.match(product.localized_short_description, /Закажите Брусок абразивный/)
  assert.doesNotMatch(product.localized_short_description, /Україн/)
  assert.match(product.meta_description, /доставкой по Украине/)
})

test('UA product storefront uses Ukrainian SEO fields instead of raw Russian supplier copy', async () => {
  const [product] = await localizeCatalogProducts([{
    id: 'p-ua',
    supplier_product_id: 'sp-ua',
    supplier_sku: 'HT-0551',
    name: 'Брусок абразивный двухсторонний',
    name_ua: 'Брусок абразивный двухсторонний',
    slug: 'brusok-ua',
    category_slug: 'abraziv',
    short_description: 'Абразивный брусок для заточки инструмента',
    description: 'Подробное описание товара',
    description_ua: 'Докладний опис товару українською мовою.',
    seo_description: 'Український опис для сторінки товару.',
    price_uah: 100,
    compare_price_uah: null,
    main_image_url: 'https://example.com/product.jpg',
    main_image_alt: 'Брусок абразивный',
    image_metadata: [{
      url: 'https://example.com/product.jpg',
      alt: 'Брусок абразивный',
      position: 0,
      isPrimary: true,
    }],
    images: ['https://example.com/product.jpg'],
    attributes: null,
    status: 'published',
    is_featured: false,
    is_price_suspicious: false,
    display_order: 0,
    meta_title: 'Двосторонній абразивний брусок 150×50×25 мм | Дача TV',
    meta_description: 'Двосторонній абразивний брусок для заточування інструменту.',
    created_at: '',
    updated_at: '',
  }], 'uk')

  assert.equal(product.localized_name, 'Двосторонній абразивний брусок 150×50×25 мм')
  assert.equal(product.localized_description, 'Докладний опис товару українською мовою.')
  assert.equal(product.main_image_alt, product.localized_name)
  assert.equal(product.image_metadata[0].alt, product.localized_name)
  assert.doesNotMatch(
    [
      product.localized_name,
      product.localized_short_description,
      product.localized_description,
      product.main_image_alt,
      product.meta_title,
      product.meta_description,
    ].join(' '),
    /[ыэъё]/i,
  )
})

test('missing RU category translation does not leak a Ukrainian category name', async () => {
  const [category] = await localizeCatalogCategories([{
    id: 'c1',
    supplier_category_id: null,
    slug: 'abraziv',
    name_ua: 'Абразивний матеріал',
    description: 'Товари категорії',
    meta_title: null,
    meta_description: null,
    image_url: null,
    is_published: true,
    display_order: 0,
    created_at: '',
    updated_at: '',
  }], 'ru')

  assert.equal(category.localized_name, 'Товары для дома и хозяйства')
  assert.doesNotMatch(category.localized_description, /Товари|категорії|Україні/)
})

test('curated manual catalog fallbacks stay meaningful and Russian', async () => {
  const [product] = await localizeCatalogProducts([{
    id: 'metal-1',
    supplier_product_id: null,
    supplier_sku: null,
    name: null,
    name_ua: 'Профнастил хвиля 10',
    slug: 'profnastyl-hvylia-10',
    category_slug: 'metaloprofil-pokrivlia-komplektuiuchi',
    short_description: 'Український опис',
    description: 'Докладний український опис',
    price_uah: 286,
    compare_price_uah: null,
    main_image_url: null,
    images: null,
    attributes: null,
    status: 'published',
    is_featured: false,
    is_price_suspicious: false,
    display_order: 0,
    meta_title: null,
    meta_description: null,
    created_at: '',
    updated_at: '',
  }], 'ru')
  const [category] = await localizeCatalogCategories([{
    id: 'manual-category',
    supplier_category_id: null,
    slug: 'metaloprofil-pokrivlia-komplektuiuchi',
    name_ua: 'Металопрофіль, покрівля та комплектуючі',
    description: 'Український опис',
    meta_title: null,
    meta_description: null,
    image_url: null,
    is_published: true,
    display_order: 0,
    created_at: '',
    updated_at: '',
  }], 'ru')

  assert.equal(product.localized_name, 'Профнастил волна 10')
  assert.match(product.localized_description, /профилированный лист/)
  assert.equal(category.localized_name, 'Металлопрофиль, кровля и комплектующие')
})

test('localized SEO resolver leaves missing RU fields empty instead of copying UA', () => {
  const seo = resolveProductSeo('ru', {
    meta_title: 'Український заголовок',
    meta_description: 'Український опис',
    description_ua: 'Український текст',
  }, { meta_title: 'Русский заголовок' })
  assert.equal(seo.meta_title, 'Русский заголовок')
  assert.equal(seo.meta_description, null)
  assert.equal(seo.description, null)
})

test('catalog landing FAQ follows the active language', () => {
  const ruText = catalogFaq('ru').flatMap((item) => [item.question, item.answer]).join(' ')
  const ukText = catalogFaq('uk').flatMap((item) => [item.question, item.answer]).join(' ')
  assert.match(ruText, /Как сделать заказ/)
  assert.doesNotMatch(ruText, /[іїєґ]/i)
  assert.match(ukText, /Як зробити замовлення/)
})
