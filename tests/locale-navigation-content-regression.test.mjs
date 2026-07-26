import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localizeCatalogCategories, localizeCatalogProducts } from '../lib/supabase/catalog.ts'
import { resolveProductSeo } from '../lib/catalog/localized-seo.ts'

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
