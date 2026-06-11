import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { getCatalogDiagnostics } from '@/lib/catalog/diagnostics'

export const dynamic = 'force-dynamic'

// Read-only catalog/migration diagnostics.
// Reports which migrations (047–052) are effectively applied, which columns are
// missing grouped by table, and which pipeline capabilities are safe to run.
// Protected by CRON_SECRET.
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/catalog/diagnostics
export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  try {
    const result = await getCatalogDiagnostics()
    return Response.json(result, { status: result.ok ? 200 : 200 })
  } catch (e) {
    return Response.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
