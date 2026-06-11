import { redirect } from 'next/navigation'

export default function AdminFlowersNewPage() {
  redirect('/admin/flowers#create')
}
