import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { seedManualCatalog } from '@/lib/catalog/manual-seed'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Idempotently seed the manual catalog (categories + products).
// Protected by CRON_SECRET.
//   curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<site>/api/admin/catalog/seed-manual
export async function POST(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  try {
    const result = await seedManualCatalog()
    return Response.json(result, { status: result.ok ? 200 : 500 })
  } catch (e) {
    return Response.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
