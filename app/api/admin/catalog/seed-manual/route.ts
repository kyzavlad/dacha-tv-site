import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { verifyCronAuth, cronUnauthorized } from '../../cron/_auth'
import { seedManualCatalog } from '@/lib/catalog/manual-seed'
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-session'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Public detail pages that reflect the seeded products — revalidated after a
// successful seed so the new/updated products appear without a manual redeploy.
const REVALIDATE_PATHS = [
  '/products',
  '/catalog/naturalni-produkty/medovyi-shokolad',
  '/catalog/zhyvi-olii-holodnogo-vidzhymu/maslo-holodnogo-vidzhymu-na-zamovlennia',
  '/catalog/podarunkovi-nabory/podarunkovyi-nabir-med-shokolad',
  '/catalog/podarunkovi-nabory/podarunkovyi-nabir-med-oliia',
  '/catalog/podarunkovi-nabory/podarunkovyi-nabir-med-shokolad-oliia',
]

// Authorized = a logged-in admin browser session (the button on
// /admin/catalog/pipeline) OR a Bearer/x-cron-secret CRON_SECRET (curl/cron).
// Never open to the public.
async function isAuthorized(req: Request): Promise<boolean> {
  if (verifyCronAuth(req)) return true
  const session = (await cookies()).get(ADMIN_SESSION_COOKIE)
  return verifyAdminSessionToken(session?.value)
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) return cronUnauthorized()

  // seedManualCatalog never throws and always returns a plain, serializable
  // object, so the response is always clean JSON — never a 500 RSC render.
  const result = await seedManualCatalog()

  if (result.ok) {
    for (const p of REVALIDATE_PATHS) {
      try { revalidatePath(p) } catch { /* best-effort */ }
    }
  }

  // 200 even on ok:false — this is a handled business result the admin UI renders
  // inline (green/red box), not a server crash. Only auth failures are non-2xx.
  return Response.json(result, { status: 200 })
}
