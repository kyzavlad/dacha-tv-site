export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { isSeoAutomationEnabled, seoAutomationDisabledResponse } from '@/lib/catalog/seo-automation-guard'
import {
  productCoverage,
  summarizeApply,
  formatSeoBatchNotification,
  type ApplySummary,
  type ProductCoverage,
} from '@/lib/catalog/seo-batch-report'

// ─── Unified SEO batch report / notification (UA + RU, one format) ────────────
// The SINGLE source of truth for the Telegram "PRODUCT SEO batch completed"
// message, so uk and ru read identically. n8n uses it twice per run:
//
//   1. GET  /api/admin/seo/batch-report?locale=ru
//        → returns current coverage. Store it as the run's `before` snapshot.
//   2. POST /api/admin/seo/batch-report
//        Body: { locale, mode?, limit, batchSize,
//                apply: { received, updated, skipped, invalid, errors, errorGroups? },
//                before?: <coverage from step 1>, extraNotes?: string[] }
//        → computes `after` coverage live and returns { notification } — the
//          exact string to send to Telegram.
//
// Protected by CRON_SECRET. Read-only: never writes SEO or touches the store.

function normalizeLocale(raw: unknown): string {
  const l = String(raw ?? '').trim().toLowerCase()
  return l === 'ua' ? 'uk' : l
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  if (!isSeoAutomationEnabled()) return seoAutomationDisabledResponse()
  const locale = normalizeLocale(new URL(req.url).searchParams.get('locale') ?? 'uk')
  if (locale !== 'uk' && locale !== 'ru') {
    return Response.json({ ok: false, message: 'locale must be uk or ru' }, { status: 400 })
  }
  try {
    const coverage = await productCoverage(locale)
    return Response.json({ ok: true, locale, coverage })
  } catch (e) {
    return Response.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 200 })
  }
}

interface ReportBody {
  locale?: unknown
  mode?: unknown
  limit?: unknown
  batchSize?: unknown
  apply?: {
    received?: number
    updated?: number
    skipped?: number
    invalid?: number
    errors?: number
    errorGroups?: Record<string, number>
  }
  // Aggregate alternative when the caller does not have a raw apply result.
  processed?: number
  applied?: number
  skipped?: number
  failed?: number
  errorGroups?: Record<string, number>
  before?: ProductCoverage
  extraNotes?: string[]
}

export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  if (!isSeoAutomationEnabled()) return seoAutomationDisabledResponse()

  let body: ReportBody
  try { body = (await req.json()) as ReportBody } catch { return Response.json({ ok: false, message: 'Invalid JSON body' }, { status: 400 }) }

  const locale = normalizeLocale(body.locale ?? 'uk')
  if (locale !== 'uk' && locale !== 'ru') {
    return Response.json({ ok: false, message: 'locale must be uk or ru' }, { status: 400 })
  }

  const mode = String(body.mode ?? 'APPLY').toUpperCase()
  const limit = Number(body.limit) || 0
  const batchSize = Number(body.batchSize) || 0

  // Build the summary from a raw apply result (preferred) or aggregate totals.
  let summary: ApplySummary
  if (body.apply && typeof body.apply === 'object') {
    const a = body.apply
    summary = summarizeApply({
      received: Number(a.received) || 0,
      updated: Number(a.updated) || 0,
      skipped: Number(a.skipped) || 0,
      invalid: Number(a.invalid) || 0,
      errors: Number(a.errors) || 0,
      errorGroups: a.errorGroups ?? {},
    })
  } else {
    const processed = Number(body.processed) || 0
    const applied = Number(body.applied) || 0
    const skipped = Number(body.skipped) || 0
    const failed = Number(body.failed) || 0
    const topReasons = Object.entries(body.errorGroups ?? {})
      .sort((x, y) => y[1] - x[1]).slice(0, 3).map(([r, n]) => `${r} (${n})`)
    summary = {
      processed, applied, skipped, failed, topReasons,
      throughputNote: applied < processed
        ? `Applied (${applied}) < processed (${processed}): ${skipped} skipped, ${failed} failed.`
        : null,
    }
  }

  try {
    const after = await productCoverage(locale)
    const notification = formatSeoBatchNotification({
      locale, mode, limit, batchSize, summary,
      before: body.before ?? null, after,
      extraNotes: Array.isArray(body.extraNotes) ? body.extraNotes.map(String) : undefined,
    })
    return Response.json({ ok: true, locale, notification, summary, coverage: { before: body.before ?? null, after } })
  } catch (e) {
    return Response.json({ ok: false, message: e instanceof Error ? e.message : String(e) }, { status: 200 })
  }
}
