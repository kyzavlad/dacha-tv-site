export const dynamic = 'force-dynamic'

import { verifyCronAuth, cronUnauthorized } from '../_auth'
import { publishBatch } from '@/lib/catalog/automation'

export async function GET(req: Request) {
  if (!verifyCronAuth(req)) return cronUnauthorized()
  const result = await publishBatch()
  return Response.json(result)
}
