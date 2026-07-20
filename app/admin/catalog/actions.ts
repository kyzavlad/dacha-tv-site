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

type AdminClient = ReturnType<typeof getAdminClient>

// Promote one supplier product into catalog_products as a draft. Pure DB work —
// NO redirect — so it is safe to call in a loop (the old code called an action
// that redirect()'d on the first iteration, which threw NEXT_REDIRECT and
// aborted the whole batch after a single row). Resolves category_slug reliably
// from supplier_category_id → catalog_categories.slug instead of leaving the new
// row uncategorised. Returns true when the row was promoted.
async function promoteSupplierToCatalog(client: AdminClient, supplierId: string): Promise<boolean> {
  const { data: sp } = await client
    .from('supplier_products')
    .select('id, supplier_sku, name, name_ua, slug, supplier_category_id, short_description_ua, description, description_ua, our_price_uah, price_uah, main_image_url, images, attributes, meta_title, meta_description')
    .eq('id', supplierId)
    .single()

  if (!sp) return false

  const slug = sp.slug || autoSlug(sp.name_ua ?? sp.name ?? sp.supplier_sku)

  // Reliable category: map the supplier category id to the catalog slug.
  let categorySlug: string | null = null
  if (sp.supplier_category_id) {
    const { data: cat } = await client
      .from('catalog_categories')
      .select('slug')
      .eq('supplier_category_id', sp.supplier_category_id)
      .maybeSingle()
    categorySlug = cat?.slug ?? null
  }

  await client.from('supplier_products').update({ is_approved: true }).eq('id', supplierId)

  await client.from('catalog_products').upsert(
    {
      supplier_product_id: sp.id,
      supplier_sku: sp.supplier_sku,
      name_ua: sp.name_ua ?? sp.name,
      slug,
      category_slug: categorySlug,
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
  return true
}

// Legacy single-item approval. Retained for backward compatibility (external
// callers / scripts may still use it); no longer wired into the admin UI, which
// relies on the automated import pipeline. The redirect lives here — NOT in the
// shared core — so batch callers never trigger it.
export async function approveProductAction(supplierId: string): Promise<void> {
  const client = getAdminClient()
  await promoteSupplierToCatalog(client, supplierId)
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

// Bulk promote up to N in-stock, image-having supplier products → catalog drafts.
// Loop-safe: each row goes through the shared core (no redirect); the single
// revalidate + redirect happens once after the loop. Retained for compatibility;
// the daily import pipeline is the primary promotion path.
export async function bulkApproveFirstN(limit: number): Promise<void> {
  const client = getAdminClient()

  const { data: candidates } = await client
    .from('supplier_products')
    .select('id')
    .eq('is_in_stock', true)
    .eq('is_approved', false)
    .not('main_image_url', 'is', null)
    .not('name_ua', 'is', null)
    .order('publish_priority', { ascending: false })
    .order('stock_quantity', { ascending: false })
    .limit(limit)

  for (const sp of candidates ?? []) {
    await promoteSupplierToCatalog(client, sp.id as string)
  }

  revalidatePath('/admin/catalog')
  redirect('/admin/catalog')
}
