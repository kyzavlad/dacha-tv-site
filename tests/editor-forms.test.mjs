import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ruTranslationIntent, editorRedirectQuery } from '../lib/admin/editor-forms.ts'

test('ruTranslationIntent: all-empty fields → clear', () => {
  assert.equal(ruTranslationIntent({ meta_title: null, meta_description: '', description: '   ', seo_keywords: null }), 'clear')
})

test('ruTranslationIntent: any set field → upsert', () => {
  assert.equal(ruTranslationIntent({ meta_title: 'Заголовок', meta_description: null, description: null, seo_keywords: null }), 'upsert')
  assert.equal(ruTranslationIntent({ meta_title: null, meta_description: null, description: null, seo_keywords: null, h1: 'H1' }), 'upsert')
})

test('editorRedirectQuery never reports saved=1 on error', () => {
  const q = editorRedirectQuery({ error: true, warn: 'attributes' })
  assert.equal(q, '?error=1')
  assert.doesNotMatch(q, /saved=1/)
})

test('editorRedirectQuery reports saved=1 with an optional warn param on success', () => {
  assert.equal(editorRedirectQuery({}), '?saved=1')
  assert.equal(editorRedirectQuery({ warn: 'attributes' }), '?saved=1&warn=attributes')
  assert.equal(editorRedirectQuery({ warn: null }), '?saved=1')
})
