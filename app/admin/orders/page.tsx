import { redirect } from 'next/navigation'

// Real checkout fallback orders live in /admin as inquiries (type=order).
// The separate orders table is empty in the current flow, so this page
// redirected to avoid an empty, confusing screen. Direct links still work.
export default function AdminOrdersPage() {
  redirect('/admin?type=order')
}
