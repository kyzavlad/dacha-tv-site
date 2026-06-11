import { redirect } from 'next/navigation'

export default function AdminHoneyNewPage() {
  redirect('/admin/honey#create')
}
