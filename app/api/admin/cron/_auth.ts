// Shared admin route authentication.
// Accepts either:
//   Authorization: Bearer <CRON_SECRET>
//   x-cron-secret: <CRON_SECRET>
export function verifyCronAuth(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get('Authorization') ?? ''
  if (auth === `Bearer ${secret}`) return true
  const xHeader = req.headers.get('x-cron-secret') ?? ''
  if (xHeader === secret) return true
  return false
}

export function cronUnauthorized() {
  return Response.json(
    { error: 'Unauthorized', hint: 'Pass Authorization: Bearer <CRON_SECRET> or x-cron-secret: <CRON_SECRET>' },
    { status: 401 },
  )
}
