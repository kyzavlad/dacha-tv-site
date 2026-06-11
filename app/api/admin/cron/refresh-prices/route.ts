export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { syncPricesAndStock } from '@/lib/supplier/sync'

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const result = await syncPricesAndStock()
  return Response.json({ ok: result.ok, synced: result.synced, errors: result.errors, message: result.message })
}
