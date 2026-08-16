export const dynamic = 'force-dynamic'
export const maxDuration = 60

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { syncSupplierRrpPrices } from '@/lib/supplier/rrp-sync'

function intParam(url: URL, key: string): number | undefined {
  const raw = url.searchParams.get(key)
  if (raw == null || raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? Math.floor(n) : undefined
}

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()

  const url = new URL(req.url)
  const result = await syncSupplierRrpPrices({
    offset: intParam(url, 'offset'),
    batchSize: intParam(url, 'batchSize'),
    maxBatches: intParam(url, 'maxBatches'),
    maxMillis: intParam(url, 'maxMillis'),
  })

  return Response.json(result, { status: result.ok ? 200 : 500 })
}
