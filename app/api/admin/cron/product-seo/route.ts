export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { getAdminClient } from '@/lib/supabase/admin'
import { sendProductSeoBatch } from '@/lib/catalog/seo-generate'
import { isSeoAutomationEnabled, seoDisabledResponse } from '@/lib/seo/automation-guard'

// Daily product SEO: send a bounded batch of published products that still need
// SEO to n8n (new system). The legacy Google-Sheets importer is no longer part
// of the daily flow — it remains available only via the admin "Legacy" card.
// No-op with a clear message when N8N_SEO_WEBHOOK_URL is not configured.
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  // Kill-switch: return before touching Supabase while SEO automation is paused.
  if (!isSeoAutomationEnabled()) return seoDisabledResponse()

  const client = getAdminClient()
  const startedAt = Date.now()
  const { data: log } = await client
    .from('supplier_sync_log')
    .insert({ sync_type: 'product_seo', status: 'running', triggered_by: 'cron' })
    .select('id').single()

  try {
    const result = await sendProductSeoBatch(100)
    await client.from('supplier_sync_log').update({
      status: result.ok ? 'completed' : 'failed',
      products_total: result.sent,
      error_details: { message: result.message, sent: result.sent, source: 'n8n', duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return Response.json({ ok: result.ok, sent: result.sent, message: result.message })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await client.from('supplier_sync_log').update({
      status: 'failed',
      error_details: { message: msg, duration_ms: Date.now() - startedAt },
      completed_at: new Date().toISOString(),
    }).eq('id', log?.id)
    return Response.json({ ok: false, message: msg }, { status: 200 })
  }
}
