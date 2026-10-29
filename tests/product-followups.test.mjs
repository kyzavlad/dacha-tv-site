import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getRelatedCatalogProducts } from '../lib/supabase/catalog.ts'
import { isDiscoveryVisibleProduct } from '../lib/catalog/discovery.ts'
import { orderProductLines, orderProductUrl } from '../lib/notifications/order-products.ts'
import { attributionNotificationLine, buildStoredSource, formatAttribution } from '../lib/analytics/attribution.ts'
import { recipientNamePreview } from '../lib/supplier/recipient-name-preview.ts'
import { normaliseRecipientNames } from '../lib/supplier/recipient-name.ts'
import { buildPersonalCabOrderPayload } from '../lib/supplier/order.ts'
import WebSocket from 'ws'

const fresh = (id, category = 'scooter') => ({ id, slug: `fixture-${id}`, category_slug: category, name_ua: `Шина для скутера ${id}`, source: 'supplier', supplier_sku: id, status: 'published', price_uah: 100, is_in_stock: true, stock_quantity: 1, stock_synced_at: new Date().toISOString() })
function fakeCatalog(t, handler) {
  const oldWebSocket = globalThis.WebSocket
  globalThis.WebSocket = WebSocket
  t.after(() => { if (oldWebSocket === undefined) delete globalThis.WebSocket; else globalThis.WebSocket = oldWebSocket })
  const old = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_ANON_KEY }
  process.env.SUPABASE_URL = 'https://catalog-fixture.invalid'
  process.env.SUPABASE_ANON_KEY = 'fixture'
  t.after(() => { for (const [key, value] of [['SUPABASE_URL', old.url], ['SUPABASE_ANON_KEY', old.key]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value } })
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input instanceof Request ? input.url : input)
    assert.equal(url.hostname, 'catalog-fixture.invalid')
    return new Response(JSON.stringify(handler(url)), { headers: { 'content-type': 'application/json' } })
  })
}
test('related rail never lets unavailable leading rows consume the visible slots', async t => {
  let requests = 0
  fakeCatalog(t, url => {
    requests++
    assert.equal(url.pathname, '/rest/v1/catalog_products')
    assert.match(url.search, /stock_synced_at/)
    return [...Array.from({length: 32}, (_, i) => ({...fresh(`old${i}`), stock_synced_at: '2026-08-15T00:00:00Z'})), ...Array.from({length: 4}, (_, i) => fresh(`ok${i}`))]
  })
  const result = await getRelatedCatalogProducts('scooter', 'current', 4)
  assert.equal(result.length, 4)
  assert.ok(result.every(isDiscoveryVisibleProduct))
  assert.equal(requests, 1, 'enough same-category stock needs no fallback queries')
})
test('sparse category falls back only to real published supplier siblings', async t => {
  fakeCatalog(t, url => {
    const table = url.pathname.split('/').at(-1)
    if (table === 'catalog_products') return url.searchParams.get('category_slug') === 'in.(scooter)' ? [fresh('only')] : [fresh('sibling', 'moped'), {...fresh('zero', 'moped'), stock_quantity: 0}]
    if (table === 'catalog_categories') return url.searchParams.get('select') === 'supplier_category_id' ? [{supplier_category_id: '10'}] : [{slug: 'moped'}]
    if (url.searchParams.get('select') === 'parent_supplier_id') return [{parent_supplier_id: 'parent-fixture'}]
    assert.equal(url.searchParams.get('parent_supplier_id'), 'eq.parent-fixture')
    return [{supplier_id: '11'}]
  })
  assert.deepEqual((await getRelatedCatalogProducts('scooter', 'current', 4)).map(p => p.id), ['only', 'sibling'])
})
test('no safe inventory returns an empty rail rather than arbitrary store products', async t => {
  fakeCatalog(t, () => [])
  assert.deepEqual(await getRelatedCatalogProducts('scooter', 'current'), [])
})
test('order lines contain each clickable product URL and keep quantity/total', () => {
  const items = [{productType:'catalog',productSlug:'fixture-tyre',name:'Шина',quantity:3,price:145}, {productType:'flower',productSlug:'fixture-flower',name:'Квітка',quantity:1,price:100}]
  const message = orderProductLines(items)
  assert.match(message, /× 3 — 435 ₴\nhttps:\/\/dachatv.com\/catalog\/all\/fixture-tyre/)
  assert.match(message, /https:\/\/dachatv.com\/flowers\/fixture-flower/)
  assert.doesNotMatch(message, /checkout|Сторінка:|LP:/)
  assert.equal(orderProductUrl({...items[0],productSlug:'https://evil.invalid'}), null)
  assert.equal(orderProductUrl({...items[0],productType:'https://evil.invalid'}), null)
})
test('human notification removes checkout/LP while internal attribution stays intact', () => {
  const cookie = encodeURIComponent('utm_source=google&utm_medium=cpc&lp=%2Fcheckout')
  assert.equal(attributionNotificationLine(cookie, false), 'Source: google / cpc')
  assert.match(buildStoredSource('/checkout', formatAttribution(cookie)), /\/checkout.*utm: google\/cpc.*lp: \/checkout/)
})
for (const [firstName, lastName, expected] of [['Ivan','Koval',['Іван','Ковал']],['Sasha','Shcherba',['Саша','Щерба']],['Alex','Petrenko',['Алекс','Петренко']],['Yuliia','Koval',['Юлія','Ковал']],['Ivan Koval','Koval',['Іван','Ковал']],['Iван','Коваль',['Іван','Коваль']]]) {
  test(`editable draft for ${firstName} never expands a nickname or guesses a missing letter`, () => {
    const draft = recipientNamePreview({firstName,lastName})
    assert.equal(draft.ok, true)
    assert.equal(draft.changed, true)
    assert.deepEqual([draft.firstName,draft.lastName], expected)
    assert.equal(recipientNamePreview(draft).changed, false)
  })
}
for (const firstName of ['Évan','Iv\u200ban','Ivan2','I.','Koval Ivan','Сер\u202eгей']) {
  test(`unsafe/ambiguous field is not silently repaired: ${JSON.stringify(firstName)}`, () => assert.equal(recipientNamePreview({firstName,lastName:'Koval'}).ok, false))
}
test('Latin remains blocked at the server/supplier boundary regardless of UI confirmation', () => {
  assert.equal(normaliseRecipientNames({firstName:'Ivan',lastName:'Koval',confirmed:true}).ok, false)
  assert.equal(buildPersonalCabOrderPayload({receiver_first_name:'Ivan',receiver_last_name:'Koval',receiver_phone:'+380671234567',method_payment:'cashondelivery',location:'fixture',items:[{supplier_sku:'fixture',quantity:1,price_uah:1701}]}).ok,false)
})
