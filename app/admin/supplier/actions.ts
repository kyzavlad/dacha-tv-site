'use server'

import { revalidatePath } from 'next/cache'
import { syncSupplierCategories, syncSupplierProducts, syncPricesAndStock } from '@/lib/supplier/sync'
import type { SyncResult } from '@/lib/supplier/sync'

export async function syncCategoriesAction(): Promise<SyncResult> {
  const result = await syncSupplierCategories()
  revalidatePath('/admin/supplier')
  return result
}

export async function syncProductsAction(): Promise<SyncResult> {
  const result = await syncSupplierProducts({ pageSize: 1000 })
  revalidatePath('/admin/supplier')
  return result
}

export async function syncPricesAction(): Promise<SyncResult> {
  const result = await syncPricesAndStock()
  revalidatePath('/admin/supplier')
  return result
}
