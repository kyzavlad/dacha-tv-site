import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isSupplierStockStale, SUPPLIER_STOCK_MAX_AGE_MS } from '../lib/catalog/stock-freshness.ts'
import { stockStatus, isPurchasableForStock } from '../lib/catalog/stock.ts'
import { revalidateSupplierStock } from '../lib/cart/stock-revalidation.ts'
import { isDiscoveryVisibleProduct } from '../lib/catalog/discovery.ts'
import { canAddToCart } from '../lib/supabase/catalog.ts'
import { buildNewProductRow } from '../lib/catalog/new-product-insert.ts'
import { toMerchantFeedItem } from '../lib/catalog/merchant-feed.ts'

const now = Date.parse('2026-10-29T03:30:00Z')
const row = { source: 'supplier', supplier_sku: 'FIXTURE-STALE', is_in_stock: true, stock_quantity: 1, stock_synced_at: '2026-08-15T03:00:00Z' }
for (const [age, stale] of [[0,false],[SUPPLIER_STOCK_MAX_AGE_MS-1,false],[SUPPLIER_STOCK_MAX_AGE_MS,false],[SUPPLIER_STOCK_MAX_AGE_MS+1,true]]) {
  test(`daily stock freshness boundary ${age}ms`, () => assert.equal(isSupplierStockStale({ ...row, stock_synced_at: new Date(now-age).toISOString() },now),stale))
}
for (const stamp of [null,'','not-a-date','2026-10-30T00:00:00Z']) {
  test(`missing, invalid or future stock is unconfirmed: ${stamp}`, () => assert.equal(isSupplierStockStale({ ...row, stock_synced_at:stamp },now),true))
}
test('an old positive flag cannot advertise, add to cart, or pass authoritative checkout', () => {
  assert.equal(stockStatus(row),'unknown')
  assert.equal(isPurchasableForStock(row),false)
  assert.equal(isDiscoveryVisibleProduct(row),false)
  assert.equal(canAddToCart({ ...row,status:'published',price_uah:100,inquiry_only:false }),false)
  assert.equal(toMerchantFeedItem({ ...row,id:'fixture',status:'published',price_uah:100,name:'Fixture',slug:'fixture',category_slug:'fixture',main_image_url:'https://example.com/fixture.jpg' }),null)
  const cart = [{productType:'catalog',productSlug:'fixture'}]
  assert.deepEqual(revalidateSupplierStock({items:cart,rows:[{...row,slug:'fixture'}],lookupFailed:false,nowMs:now}),{ok:false,reason:'stock_stale',names:['fixture']})
  assert.equal(row.is_in_stock,true,'unknown is not invented zero stock')
  assert.equal(row.stock_quantity,1)
})
test('fresh current supplier stock works; legacy null-source SKU remains protected', () => {
  const fresh={...row,stock_synced_at:new Date().toISOString()}
  assert.equal(stockStatus(fresh),'in_stock')
  assert.equal(isPurchasableForStock(fresh),true)
  assert.equal(isDiscoveryVisibleProduct(fresh),true)
  assert.equal(isSupplierStockStale({...row,source:null},now),true)
})
test('manual and metal inquiry ownership is preserved, explicit zero still blocks', () => {
  assert.equal(isSupplierStockStale({...row,source:'manual'},now),false)
  assert.equal(isSupplierStockStale({...row,lead_type:'metal'},now),false)
  assert.equal(isPurchasableForStock({source:'manual',lead_type:'metal'}),true)
  assert.equal(stockStatus({...row,is_in_stock:false}),'out_of_stock')
})


test('reimporting an old supplier record cannot manufacture a fresh observation', () => {
  const sp={id:'fixture',supplier_sku:'fixture',name:'Fixture',price_uah:100,stock_quantity:1,is_in_stock:true,last_synced_at:'2026-08-15T03:00:00Z'}
  const copied=buildNewProductRow(sp,'fixture',new Set(),'2026-10-29T03:30:00Z')
  assert.equal(copied.stock_synced_at,'2026-08-15T03:00:00.000Z')
  assert.equal(isSupplierStockStale({...copied,source:'supplier'},now),true)
  const missing=buildNewProductRow({...sp,last_synced_at:null},'fixture',new Set(),'2026-10-29T03:30:00Z')
  assert.equal(missing.stock_synced_at,null)
})
test('a timestamp alone does not prove a positive supplier stock signal', () => {
  const unknown={...row,is_in_stock:null,stock_synced_at:'2026-10-29T03:00:00Z'}
  assert.equal(isSupplierStockStale(unknown,now),true)
  assert.equal(revalidateSupplierStock({items:[{productType:'catalog',productSlug:'fixture'}],rows:[{...unknown,slug:'fixture'}],lookupFailed:false,nowMs:now}).reason,'stock_stale')
})
