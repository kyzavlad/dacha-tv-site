import { redirect } from 'next/navigation'

// Redirects legacy URL to the new setup page.
export default function MaintenancePage() {
  redirect('/admin/catalog/setup')
}
