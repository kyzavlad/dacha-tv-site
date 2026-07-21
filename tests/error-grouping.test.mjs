import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  classifyBuildFailure, classifyUpsertError, recordError, mergeErrorReport, emptyErrorReport, SAMPLE_CAP,
} from '../lib/supplier/error-grouping.ts'

test('classifyBuildFailure: missing sku vs malformed record', () => {
  assert.equal(classifyBuildFailure(''), 'missing_sku')
  assert.equal(classifyBuildFailure('   '), 'missing_sku')
  assert.equal(classifyBuildFailure('ABC-123'), 'invalid_record')
})

test('classifyUpsertError maps 23xxx to database_constraint', () => {
  assert.equal(classifyUpsertError({ code: '23505', message: 'duplicate key' }), 'database_constraint')
  assert.equal(classifyUpsertError({ code: '23502', message: 'null value' }), 'database_constraint')
  assert.equal(classifyUpsertError({ code: '42883', message: 'x' }), 'upsert_failed')
  assert.equal(classifyUpsertError({ code: '', message: 'unique constraint violated' }), 'database_constraint')
  assert.equal(classifyUpsertError(null), 'unknown')
})

test('recordError accumulates counts, bounds samples, keeps code/message/offset', () => {
  const r = emptyErrorReport()
  recordError(r, 'database_constraint', 3, { skus: ['a', 'b'], code: '23505', message: 'dup', offset: 1000 })
  recordError(r, 'database_constraint', 2, { skus: ['b', 'c'], code: '23505', message: 'dup', offset: 2000 })
  assert.equal(r.total, 5)
  assert.equal(r.groups.database_constraint, 5)
  assert.deepEqual(r.details.database_constraint.sampleSkus, ['a', 'b', 'c']) // deduped
  assert.equal(r.details.database_constraint.firstOffset, 1000) // first wins
  assert.equal(r.details.database_constraint.code, '23505')
  assert.equal(r.completedWithErrors, true)
})

test('recordError caps samples at SAMPLE_CAP', () => {
  const r = emptyErrorReport()
  recordError(r, 'upsert_failed', 100, { skus: Array.from({ length: 100 }, (_, i) => `sku-${i}`) })
  assert.equal(r.details.upsert_failed.sampleSkus.length, SAMPLE_CAP)
})

test('mergeErrorReport combines window reports into a total', () => {
  const w1 = emptyErrorReport(); recordError(w1, 'missing_sku', 5, { offset: 0 })
  const w2 = emptyErrorReport(); recordError(w2, 'missing_sku', 3, { offset: 1000 }); recordError(w2, 'duplicate_sku_in_feed', 2)
  const total = mergeErrorReport(emptyErrorReport(), w1)
  mergeErrorReport(total, w2)
  assert.equal(total.groups.missing_sku, 8)
  assert.equal(total.groups.duplicate_sku_in_feed, 2)
  assert.equal(total.total, 10)
})

test('recordError ignores non-positive counts', () => {
  const r = emptyErrorReport()
  recordError(r, 'unknown', 0)
  assert.equal(r.total, 0)
  assert.deepEqual(r.groups, {})
})
