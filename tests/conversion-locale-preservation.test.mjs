import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { localizedPath } from '../lib/i18n.ts'
import { tr } from '../lib/i18n/pages.ts'

const buyNowSrc = readFileSync(new URL('../components/cart/BuyNowButton.tsx', import.meta.url), 'utf8')
const mobileMenuSrc = readFileSync(new URL('../components/layout/MobileMenu.tsx', import.meta.url), 'utf8')

test('localized checkout path preserves the active storefront locale', () => {
  assert.equal(localizedPath('uk', '/checkout'), '/checkout')
  assert.equal(localizedPath('ru', '/checkout'), '/ru/checkout')
})

test('Buy Now routes through localizedPath instead of dropping RU at checkout', () => {
  assert.match(buyNowSrc, /router\.push\(localizedPath\(locale, '\/checkout'\)\)/)
  assert.ok(!buyNowSrc.includes("router.push('/checkout')"), 'Buy Now must never force the prefix-less UA checkout')
})

test('mobile shop CTA keeps the active locale and does not hard-code Russian copy', () => {
  assert.match(mobileMenuSrc, /href=\{localizedPath\(locale, '\/catalog'\)\}/)
  assert.match(mobileMenuSrc, /tr\(\{ uk: 'Перейти до магазину', ru: 'Перейти в магазин', en: 'Go to shop' \}, locale\)/)
  assert.ok(!/>\s*Перейти в магазин\s*</.test(mobileMenuSrc), 'mobile menu must not render a raw Russian CTA for every locale')
})

test('mobile shop CTA copy resolves distinctly for UA and RU', () => {
  const copy = { uk: 'Перейти до магазину', ru: 'Перейти в магазин', en: 'Go to shop' }
  assert.equal(tr(copy, 'uk'), 'Перейти до магазину')
  assert.equal(tr(copy, 'ru'), 'Перейти в магазин')
  assert.notEqual(tr(copy, 'uk'), tr(copy, 'ru'))
})
