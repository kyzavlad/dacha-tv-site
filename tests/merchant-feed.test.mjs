import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  MERCHANT_VALIDATION_QUARANTINE_IDS,
  absoluteMerchantUrl,
  isMerchantValidationQuarantined,
  renderMerchantRss,
  toMerchantFeedItem,
} from '../lib/catalog/merchant-feed.ts'

const good = {
  id: '7f208de7-62bc-46e0-824f-cd32abfddaad',
  supplier_sku: 'SKU-1',
  name: 'Компрессор <test>',
  name_ua: 'Компресор & набір',
  slug: 'kompresor-1',
  category_slug: 'kompresory',
  short_description: '<p>Надійний компресор для майстерні</p>',
  price_uah: 2499,
  main_image_url: 'https://images.example.com/a.jpg',
  stock_quantity: 4,
  is_in_stock: true,
  inquiry_only: false,
  is_price_suspicious: false,
  status: 'published',
  source: 'supplier',
  lead_type: null,
}

test('Merchant validation quarantine is exact, unique, and does not catch clean products', () => {
  assert.equal(MERCHANT_VALIDATION_QUARANTINE_IDS.length, 1293)
  assert.equal(new Set(MERCHANT_VALIDATION_QUARANTINE_IDS).size, 1293)
  assert.equal(isMerchantValidationQuarantined('04eedbb3-ec18-4624-8c7c-3c06e1cef73f'), true)
  assert.equal(isMerchantValidationQuarantined('858d15db-951a-4f94-96bf-7a6bb4768aa2'), true)
  assert.equal(isMerchantValidationQuarantined('ffa8d7bb-8ca4-476b-b1a6-ef614b023b52'), true)
  // Pending crawl is processing, not a merchant-action defect: do not suppress it.
  assert.equal(isMerchantValidationQuarantined('051dfd66-26a5-4478-b2f2-a525fc41cdf6'), false)
  assert.equal(isMerchantValidationQuarantined(good.id), false)
})

test('a clean supplier product becomes a Merchant item with canonical Dacha URL', () => {
  const item = toMerchantFeedItem(good)
  assert.ok(item)
  assert.equal(item.price, '2499.00 UAH')
  assert.equal(item.availability, 'in_stock')
  assert.equal(item.link, 'https://dachatv.com/catalog/kompresory/kompresor-1')
  assert.equal(item.description, 'Надійний компресор для майстерні')
})

test('Merchant safety gates reject non-buyable or risky catalog rows', () => {
  for (const row of [
    { ...good, status: 'archived' },
    { ...good, source: 'manual' },
    { ...good, is_in_stock: false },
    { ...good, stock_quantity: 0 },
    { ...good, inquiry_only: true },
    { ...good, is_price_suspicious: true },
    { ...good, lead_type: 'metal' },
    { ...good, price_uah: 9.99 },
    { ...good, main_image_url: null },
    { ...good, slug: null },
  ]) {
    assert.equal(toMerchantFeedItem(row), null)
  }
})

test('relative images are made absolute and insecure http images are upgraded', () => {
  assert.equal(absoluteMerchantUrl('/img/p.jpg'), 'https://dachatv.com/img/p.jpg')
  assert.equal(absoluteMerchantUrl('http://cdn.example.com/p.jpg'), 'https://cdn.example.com/p.jpg')
})

test('RSS output escapes XML and contains required core product fields', () => {
  const item = toMerchantFeedItem(good)
  assert.ok(item)
  const xml = renderMerchantRss([item])
  assert.match(xml, /xmlns:g="http:\/\/base\.google\.com\/ns\/1\.0"/)
  for (const field of ['g:id', 'g:title', 'g:description', 'g:link', 'g:image_link', 'g:availability', 'g:price', 'g:condition']) {
    assert.match(xml, new RegExp(`<${field}>`))
  }
  assert.match(xml, /Компресор &amp; набір/)
})

test('feed route walks the complete safe catalog with keyset pagination', () => {
  const route = readFileSync(new URL('../app/merchant-feed.xml/route.ts', import.meta.url), 'utf8')
  const pageSizeIndex = route.indexOf('MERCHANT_FEED_PAGE_SIZE = 1000')
  const cursorIndex = route.indexOf("query = query.gt('id', cursor)")
  const quarantineIndex = route.indexOf('filter((row) => !isMerchantValidationQuarantined(row.id))')
  assert.ok(pageSizeIndex >= 0)
  assert.ok(cursorIndex > pageSizeIndex)
  assert.ok(quarantineIndex > cursorIndex)
  assert.ok(!route.includes('MERCHANT_INITIAL_FEED_LIMIT'))
  assert.match(route, /MERCHANT_FEED_MAX_PAGES = 100/)
  assert.match(route, /X-Merchant-Feed-Selected/)
  assert.match(route, /X-Merchant-Feed-Quarantined/)
})

test('feed code never fabricates product identifiers', () => {
  const serializer = readFileSync(new URL('../lib/catalog/merchant-feed.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../app/merchant-feed.xml/route.ts', import.meta.url), 'utf8')
  assert.ok(!serializer.includes('identifier_exists'))
  assert.ok(!route.includes('identifier_exists'))
  assert.ok(!serializer.includes('<g:gtin>'))
  assert.ok(!serializer.includes('<g:mpn>'))
})
