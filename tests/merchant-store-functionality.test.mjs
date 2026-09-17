import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('robots keeps the public purchase path crawlable for Merchant review', () => {
  const source = readFileSync(new URL('../app/robots.ts', import.meta.url), 'utf8')
  assert.match(source, /disallow:\s*\['\/admin', '\/api\/'\]/)
  assert.doesNotMatch(source, /disallow:[^\n]*\/checkout/)
  assert.doesNotMatch(source, /disallow:[^\n]*\/cart/)
})

test('checkout is crawlable but explicitly excluded from search indexing', () => {
  const source = readFileSync(new URL('../app/checkout/layout.tsx', import.meta.url), 'utf8')
  assert.match(source, /index:\s*false/)
  assert.match(source, /follow:\s*true/)
})

test('conventional cart URL no longer resolves as a dead page', () => {
  const source = readFileSync(new URL('../app/cart/page.tsx', import.meta.url), 'utf8')
  assert.match(source, /redirect\('\/checkout'\)/)
})
