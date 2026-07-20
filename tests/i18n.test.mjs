import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitLocale, localizedPath, switchLocaleHref, isLocalizablePath, isLocale } from '../lib/i18n.ts'

test('splitLocale strips a locale prefix to the canonical path', () => {
  assert.deepEqual(splitLocale('/ru/catalog/all'), { locale: 'ru', path: '/catalog/all' })
  assert.deepEqual(splitLocale('/en/honey'), { locale: 'en', path: '/honey' })
  assert.deepEqual(splitLocale('/catalog'), { locale: 'uk', path: '/catalog' })
  assert.deepEqual(splitLocale('/ru'), { locale: 'ru', path: '/' })
  assert.deepEqual(splitLocale('/'), { locale: 'uk', path: '/' })
})

test('localizedPath prefixes ru/en and leaves uk unprefixed', () => {
  assert.equal(localizedPath('uk', '/catalog'), '/catalog')
  assert.equal(localizedPath('ru', '/catalog'), '/ru/catalog')
  assert.equal(localizedPath('en', '/catalog'), '/en/catalog')
  assert.equal(localizedPath('ru', '/'), '/ru')
  assert.equal(localizedPath('uk', '/'), '/')
})

test('isLocalizablePath excludes admin and api', () => {
  assert.equal(isLocalizablePath('/catalog'), true)
  assert.equal(isLocalizablePath('/'), true)
  assert.equal(isLocalizablePath('/admin'), false)
  assert.equal(isLocalizablePath('/admin/catalog'), false)
  assert.equal(isLocalizablePath('/api'), false)
  assert.equal(isLocalizablePath('/api/admin/cron'), false)
})

test('switchLocaleHref: uk↔ru↔en round trips without double-prefixing', () => {
  // uk → ru
  assert.equal(switchLocaleHref('ru', '/catalog/x'), '/ru/catalog/x')
  // ru → uk (strips prefix)
  assert.equal(switchLocaleHref('uk', '/ru/catalog/x'), '/catalog/x')
  // ru → en (swaps prefix, never /en/ru/…)
  assert.equal(switchLocaleHref('en', '/ru/catalog/x'), '/en/catalog/x')
  // repeated switching stays single-prefixed
  let p = '/catalog/x'
  p = switchLocaleHref('ru', p); assert.equal(p, '/ru/catalog/x')
  p = switchLocaleHref('en', p); assert.equal(p, '/en/catalog/x')
  p = switchLocaleHref('ru', p); assert.equal(p, '/ru/catalog/x')
  p = switchLocaleHref('uk', p); assert.equal(p, '/catalog/x')
})

test('switchLocaleHref preserves the query string', () => {
  assert.equal(switchLocaleHref('ru', '/catalog/all', 'sort=price&page=2'), '/ru/catalog/all?sort=price&page=2')
  assert.equal(switchLocaleHref('uk', '/ru/catalog/all', '?sort=price'), '/catalog/all?sort=price')
  assert.equal(switchLocaleHref('ru', '/catalog', ''), '/ru/catalog')
})

test('switchLocaleHref never localizes admin or api', () => {
  assert.equal(switchLocaleHref('ru', '/admin/orders'), '/admin/orders')
  assert.equal(switchLocaleHref('en', '/admin/catalog/123'), '/admin/catalog/123')
  assert.equal(switchLocaleHref('ru', '/api/admin/cron/sync-products', 'x=1'), '/api/admin/cron/sync-products?x=1')
})

test('home routes switch correctly', () => {
  assert.equal(switchLocaleHref('ru', '/'), '/ru')
  assert.equal(switchLocaleHref('en', '/ru'), '/en')
  assert.equal(switchLocaleHref('uk', '/ru'), '/')
})

test('isLocale guards', () => {
  assert.equal(isLocale('uk'), true)
  assert.equal(isLocale('ru'), true)
  assert.equal(isLocale('en'), true)
  assert.equal(isLocale('de'), false)
  assert.equal(isLocale(null), false)
})
