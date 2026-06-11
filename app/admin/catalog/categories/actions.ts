'use server'

import { getAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

function autoSlug(text: string): string {
  const map: Record<string, string> = {
    а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ye',ж:'zh',з:'z',
    и:'y',і:'i',ї:'yi',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',
    р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'yu',я:'ya',
  }
  return text.toLowerCase().split('').map((c) => map[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `cat-${Date.now()}`
}

export async function createCatalogCategoryAction(formData: FormData): Promise<void> {
  const client = getAdminClient()
  const name_ua = (formData.get('name_ua') as string ?? '').trim()
  const supplier_category_id = (formData.get('supplier_category_id') as string ?? '').trim() || null
  const slug = ((formData.get('slug') as string ?? '').trim() || autoSlug(name_ua))
  const description = (formData.get('description') as string ?? '').trim() || null
  const meta_title = (formData.get('meta_title') as string ?? '').trim() || null
  const meta_description = (formData.get('meta_description') as string ?? '').trim() || null
  const image_url = (formData.get('image_url') as string ?? '').trim() || null

  if (!name_ua) return

  await client.from('catalog_categories').upsert(
    { supplier_category_id, slug, name_ua, description, meta_title, meta_description, image_url, updated_at: new Date().toISOString() },
    { onConflict: 'slug' },
  )

  revalidatePath('/admin/catalog/categories')
  redirect('/admin/catalog/categories')
}

export async function publishCategoryAction(id: string): Promise<void> {
  const client = getAdminClient()
  await client.from('catalog_categories').update({ is_published: true, updated_at: new Date().toISOString() }).eq('id', id)
  revalidatePath('/admin/catalog/categories')
  revalidatePath('/catalog')
  redirect('/admin/catalog/categories')
}

export async function unpublishCategoryAction(id: string): Promise<void> {
  const client = getAdminClient()
  await client.from('catalog_categories').update({ is_published: false, updated_at: new Date().toISOString() }).eq('id', id)
  revalidatePath('/admin/catalog/categories')
  revalidatePath('/catalog')
  redirect('/admin/catalog/categories')
}

export async function deleteCategoryAction(id: string): Promise<void> {
  const client = getAdminClient()
  await client.from('catalog_categories').delete().eq('id', id)
  revalidatePath('/admin/catalog/categories')
  redirect('/admin/catalog/categories')
}

// Bulk: create catalog_categories from supplier_categories (first N by name)
export async function bulkActivateFromSupplierAction(formData: FormData): Promise<void> {
  const client = getAdminClient()
  const limitStr = formData.get('limit') as string | null
  const limit = Math.min(parseInt(limitStr ?? '10', 10) || 10, 50)

  const { data: supplierCats } = await client
    .from('supplier_categories')
    .select('supplier_id, name, name_ua')
    .order('name', { ascending: true })
    .limit(limit)

  if (!supplierCats) return

  const rows = supplierCats.map((sc) => {
    const displayName = (sc.name_ua || sc.name) as string
    return {
      supplier_category_id: sc.supplier_id as string,
      slug: autoSlug(displayName),
      name_ua: displayName,
      is_published: false,
      updated_at: new Date().toISOString(),
    }
  })

  await client.from('catalog_categories').upsert(rows, { onConflict: 'slug', ignoreDuplicates: true })

  revalidatePath('/admin/catalog/categories')
  redirect('/admin/catalog/categories')
}

// Batch assign category_slug to catalog_products that match supplier_category_id
export async function assignCategoryToProductsAction(
  catalogCategoryId: string,
  supplierCategoryId: string,
  categorySlug: string,
): Promise<void> {
  const client = getAdminClient()

  await client
    .from('catalog_products')
    .update({ category_slug: categorySlug, updated_at: new Date().toISOString() })
    .in(
      'supplier_sku',
      (
        await client
          .from('supplier_products')
          .select('supplier_sku')
          .eq('supplier_category_id', supplierCategoryId)
      ).data?.map((r) => r.supplier_sku) ?? []
    )

  revalidatePath('/admin/catalog/categories')
  revalidatePath('/admin/catalog')
  redirect('/admin/catalog/categories')
}

export async function fixNumericCategoryNamesAction(): Promise<void> {
  const client = getAdminClient()

  const { data: cats } = await client
    .from('catalog_categories')
    .select('id, supplier_category_id, name_ua')

  const numericCats = (cats ?? []).filter((c) => /^\d+$/.test(String(c.name_ua ?? '')))
  if (numericCats.length === 0) { revalidatePath('/admin/catalog/categories'); redirect('/admin/catalog/categories') }

  const supplierIds = numericCats.map((c) => c.supplier_category_id).filter(Boolean) as string[]
  const { data: supplierCats } = await client
    .from('supplier_categories')
    .select('supplier_id, name, name_ua')
    .in('supplier_id', supplierIds)

  const nameMap = new Map(
    (supplierCats ?? []).map((sc) => [
      sc.supplier_id as string,
      ((sc.name_ua || sc.name) as string | null)?.trim() ?? null,
    ])
  )

  for (const cat of numericCats) {
    if (!cat.supplier_category_id) continue
    const realName = nameMap.get(cat.supplier_category_id as string)
    if (!realName || realName === cat.name_ua) continue
    await client.from('catalog_categories').update({ name_ua: realName }).eq('id', cat.id)
  }

  revalidatePath('/admin/catalog/categories')
  redirect('/admin/catalog/categories')
}
