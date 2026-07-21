import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyRow, shouldContinueImport, summarizeImport } from '../lib/catalog/import-planning.ts'

test('classifyRow: existing catalog row → update, new → insert', () => {
  assert.equal(classifyRow({ source: 'supplier' }), 'update')
  assert.equal(classifyRow(undefined), 'insert')
})

test('shouldContinueImport continues on an UPDATE-only batch (inserted=0)', () => {
  // The exact bug: 1000 rows updated, 0 inserted, backlog remains → MUST continue.
  assert.equal(shouldContinueImport({ approved: 1000, remaining: 105066 }), true)
})

test('shouldContinueImport stops when no progress was made', () => {
  assert.equal(shouldContinueImport({ approved: 0, remaining: 200 }), false) // only cap-blocked/failed left
})

test('shouldContinueImport stops when backlog is empty', () => {
  assert.equal(shouldContinueImport({ approved: 500, remaining: 0 }), false)
})

test('summarizeImport never reports "inserted" as the total work', () => {
  const msg = summarizeImport({ processed: 1000, inserted: 0, updated: 1000, approved: 1000, failed: 0, insertsSkippedCap: 0, remaining: 105066 })
  assert.match(msg, /оброблено 1000/)
  assert.match(msg, /оновлено 1000/)
  assert.match(msg, /підтверджено 1000/)
  assert.match(msg, /залишок 105066/)
})

test('summarizeImport surfaces cap-deferred inserts and failures', () => {
  const msg = summarizeImport({ processed: 500, inserted: 10, updated: 480, approved: 490, failed: 5, insertsSkippedCap: 5, remaining: 20 })
  assert.match(msg, /помилок 5/)
  assert.match(msg, /відкладено \(ліміт\) 5/)
})
