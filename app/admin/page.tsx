import { redirect } from 'next/navigation'

interface AdminPageProps {
  searchParams: Promise<{ status?: string; type?: string }>
}

// The bare /admin route no longer renders its own "Вхідні" screen — orders and
// inquiries are now managed on /admin/orders. Redirect here (forwarding any
// legacy ?status=/?type= filters, e.g. /admin?type=order) so old links and
// bookmarks keep working. No data is touched.
export default async function AdminIndexPage({ searchParams }: AdminPageProps) {
  const { status, type } = await searchParams
  const params = new URLSearchParams()
  if (status) params.set('status', status)
  if (type) params.set('type', type)
  const qs = params.toString()
  redirect(`/admin/orders${qs ? `?${qs}` : ''}`)
}
