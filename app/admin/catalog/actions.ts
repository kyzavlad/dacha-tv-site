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
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `product-${Date.now()}`
}

// Approve a single supplier product and push it to catalog_products as draft
export async function approveProductAction(supplierId: string): Promise<void> {
  const client = getAdminClient()
  const { data: sp } = await client
    .from('supplier_products')
    .select('*')
    .eq('id', supplierId)
    .single()

  if (!sp) return

  const slug = sp.slug || autoSlug(sp.name_ua ?? sp.name ?? sp.supplier_sku)

  await client.from('supplier_products').update({ is_approved: true }).eq('id', supplierId)

  await client.from('catalog_products').upsert(
    {
      supplier_product_id: sp.id,
      supplier_sku: sp.supplier_sku,
      name_ua: sp.name_ua ?? sp.name,
      slug,
      short_description: sp.short_description_ua,
      description: sp.description_ua ?? sp.description,
      price_uah: sp.our_price_uah ?? sp.price_uah ?? 0,
      compare_price_uah: sp.our_price_uah && sp.price_uah && sp.our_price_uah > sp.price_uah ? sp.price_uah : null,
      main_image_url: sp.main_image_url,
      images: sp.images,
      attributes: sp.attributes,
      status: 'draft',
      meta_title: sp.meta_title,
      meta_description: sp.meta_description,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'supplier_sku' },
  )

  revalidatePath('/admin/catalog')
  redirect('/admin/catalog')
}

// Publish a catalog_product (draft → published)
export async function publishProductAction(catalogId: string): Promise<void> {
  const client = getAdminClient()
  await client.from('catalog_products').update({
    status: 'published',
    updated_at: new Date().toISOString(),
  }).eq('id', catalogId)

  revalidatePath('/admin/catalog')
  redirect('/admin/catalog')
}

// Unpublish (published → draft)
export async function unpublishProductAction(catalogId: string): Promise<void> {
  const client = getAdminClient()
  await client.from('catalog_products').update({
    status: 'draft',
    updated_at: new Date().toISOString(),
  }).eq('id', catalogId)

  revalidatePath('/admin/catalog')
  redirect('/admin/catalog')
}

// Bulk: promote up to N in-stock, image-having, approved supplier products → catalog as draft
export async function bulkApproveFirstN(limit: number): Promise<void> {
  const client = getAdminClient()

  const { data: candidates } = await client
    .from('supplier_products')
    .select('*')
    .eq('is_in_stock', true)
    .eq('is_approved', false)
    .not('main_image_url', 'is', null)
    .not('name_ua', 'is', null)
    .order('publish_priority', { ascending: false })
    .order('stock_quantity', { ascending: false })
    .limit(limit)

  for (const sp of candidates ?? []) {
    await approveProductAction(sp.id)
  }

  revalidatePath('/admin/catalog')
  redirect('/admin/catalog')
}
