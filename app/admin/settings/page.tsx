import { redirect } from 'next/navigation'

// The site-settings screen was empty and is not part of the admin nav. Public
// social links / site settings still work via their code fallbacks
// (lib/launch-defaults.ts) and the site_settings table, so this UI is redundant.
// Redirect to a useful admin page instead of showing an empty tab. No data is
// touched, and the saveSiteSettings action remains available for future use.
export default function AdminSettingsPage() {
  redirect('/admin/catalog')
}
