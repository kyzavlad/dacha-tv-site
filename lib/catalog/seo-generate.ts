import { getAdminClient } from '@/lib/supabase/admin'

// ─── New SEO system (Supabase as source of truth, generation via n8n) ─────────
// The old Google-Sheets importer (lib/catalog/seo.ts) is legacy. SEO is now
// generated from the live catalog: the site sends a bounded batch of products /
// categories to the N8N_SEO_WEBHOOK_URL, n8n calls the AI, validates Ukrainian
// length/quality, and writes the result back to Supabase (setting seo_status='ai').
//
// Everything here is defensive: a missing column or missing webhook returns a
// readable result instead of throwing.

export const SEO_BATCH_DEFAULT = 50

export interface SeoCounts {
  webhookConfigured: boolean
  categoriesMissing: number
  productsMissing: number
  legacyFallback: number
  aiGenerated: number
  manualLocked: number
}

export interface SeoBatchResult {
  ok: boolean
  sent: number
  message: string
  details?: Record<string, unknown>
}

function webhookUrl(): string {
  return (process.env.N8N_SEO_WEBHOOK_URL ?? '').trim()
}

// Guarded HEAD count — returns 0 if the column/table is absent instead of throwing.
async function safeCount(
  build: () => PromiseLike<{ count: number | null; error: unknown }>,
): Promise<number> {
  try {
    const { count } = await build()
    return count ?? 0
  } catch {
    return 0
  }
}

export async function getSeoCounts(): Promise<SeoCounts> {
  const client = getAdminClient()
  const [categoriesMissing, productsMissing, legacyFallback, aiGenerated, manualLocked] = await Promise.all([
    safeCount(() => client.from('catalog_categories').select('id', { count: 'exact', head: true }).eq('is_published', true).eq('seo_status', 'missing')),
    safeCount(() => client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('seo_status', 'missing')),
    safeCount(() => client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('seo_source', 'fallback')),
    safeCount(() => client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('seo_status', 'ai')),
    safeCount(() => client.from('catalog_products').select('id', { count: 'exact', head: true }).eq('seo_manual_lock', true)),
  ])
  return { webhookConfigured: !!webhookUrl(), categoriesMissing, productsMissing, legacyFallback, aiGenerated, manualLocked }
}

// Shared quality guidelines forwarded to n8n so the AI prompt stays consistent
// with the site's rules (task 10).
const SEO_GUIDELINES = {
  language: 'uk',
  rules: [
    'Тільки українська мова.',
    'Без keyword stuffing.',
    'Без фейкових гарантій та медичних тверджень.',
    'Без необґрунтованих тверджень («найкращий в Україні» тощо).',
    'Meta description 140–160 символів, де можливо.',
    'Опис категорії 700–1500 символів + FAQ.',
    'Опис товару має бути корисним для покупця.',
  ],
  metal_delivery: 'Доставка по Харківській та Полтавській областях за домовленістю. Інші регіони — за індивідуальною домовленістю.',
}

async function postBatch(kind: 'product' | 'category', items: Array<Record<string, unknown>>): Promise<SeoBatchResult> {
  const url = webhookUrl()
  if (!url) {
    return { ok: false, sent: 0, message: 'N8N_SEO_WEBHOOK_URL не встановлено — додайте env var у Vercel, щоб увімкнути генерацію SEO.' }
  }
  if (items.length === 0) {
    return { ok: true, sent: 0, message: kind === 'product' ? 'Немає товарів без SEO.' : 'Немає категорій без SEO.' }
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, language: 'uk', count: items.length, guidelines: SEO_GUIDELINES, items }),
  })
  if (!res.ok) {
    return { ok: false, sent: 0, message: `n8n повернув ${res.status} ${res.statusText}` }
  }
  return { ok: true, sent: items.length, message: `Надіслано ${items.length} ${kind === 'product' ? 'товарів' : 'категорій'} у n8n для генерації SEO.` }
}

// Pick published categories that still need SEO (never manual-locked) and send
// them to n8n. Sent rows are marked 'queued' so the next batch rotates onward.
export async function sendCategorySeoBatch(limit = SEO_BATCH_DEFAULT): Promise<SeoBatchResult> {
  const client = getAdminClient()
  const { data, error } = await client
    .from('catalog_categories')
    .select('id, slug, name_ua, description, meta_title, meta_description, lead_type, source')
    .eq('is_published', true)
    .neq('seo_manual_lock', true)
    .in('seo_status', ['missing', 'queued'])
    .order('seo_generated_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) return { ok: false, sent: 0, message: `categories: ${error.message}` }

  const items = (data ?? []).map((c) => ({
    type: 'category', id: c.id, slug: c.slug, name: c.name_ua, category: c.slug,
    price: null, stock: null, source: c.source ?? 'supplier',
    product_group: c.lead_type === 'metal' ? 'metal' : c.lead_type === 'natural_products' ? 'natural' : 'catalog',
    image_url: null,
    existing_description: c.description, existing_meta_title: c.meta_title, existing_meta_description: c.meta_description,
    seo_manual_lock: false,
  }))

  const result = await postBatch('category', items)
  if (result.ok && result.sent > 0) {
    const ids = (data ?? []).map((c) => c.id)
    await client.from('catalog_categories').update({ seo_status: 'queued', seo_generated_at: new Date().toISOString() }).in('id', ids)
  }
  return result
}

// Pick published products that still need SEO. First pass prefers real, sellable
// supplier products (image + valid price + category); manual products keep their
// crafted copy and are excluded here (null price filters them out).
export async function sendProductSeoBatch(limit = SEO_BATCH_DEFAULT): Promise<SeoBatchResult> {
  const client = getAdminClient()
  const { data, error } = await client
    .from('catalog_products')
    .select('id, slug, name_ua, category_slug, description, short_description, meta_title, meta_description, price_uah, main_image_url, unit_label, lead_type, source')
    .eq('status', 'published')
    .neq('seo_manual_lock', true)
    .in('seo_status', ['missing', 'queued'])
    .not('main_image_url', 'is', null)
    .gt('price_uah', 0)
    .not('category_slug', 'is', null)
    .order('seo_generated_at', { ascending: true, nullsFirst: true })
    .limit(limit)
  if (error) return { ok: false, sent: 0, message: `products: ${error.message}` }

  const items = (data ?? []).map((p) => ({
    type: 'product', id: p.id, slug: p.slug, name: p.name_ua, category: p.category_slug,
    price: p.price_uah, stock: null, source: p.source ?? 'supplier',
    product_group: p.lead_type === 'metal' ? 'metal' : p.lead_type === 'natural_products' ? 'natural' : 'catalog',
    image_url: p.main_image_url, unit_label: p.unit_label,
    existing_description: p.description, existing_short_description: p.short_description,
    existing_meta_title: p.meta_title, existing_meta_description: p.meta_description,
    seo_manual_lock: false,
  }))

  const result = await postBatch('product', items)
  if (result.ok && result.sent > 0) {
    const ids = (data ?? []).map((p) => p.id)
    await client.from('catalog_products').update({ seo_status: 'queued', seo_generated_at: new Date().toISOString() }).in('id', ids)
  }
  return result
}

// Temporary fallback: fill empty description_ua from meta_description (set-based
// SQL via migration 054). Never overwrites a manual lock or non-empty copy.
export async function backfillSeoDescriptionFallback(): Promise<SeoBatchResult> {
  const client = getAdminClient()
  const { data, error } = await client.rpc('backfill_seo_description_fallback')
  if (error) {
    const code = (error as { code?: string }).code
    if (code === 'PGRST202' || code === '42883') {
      return { ok: false, sent: 0, message: 'Функція backfill_seo_description_fallback() відсутня — застосуйте міграцію 054.' }
    }
    return { ok: false, sent: 0, message: error.message }
  }
  const row = Array.isArray(data) ? data[0] : data
  const updated = Number((row as { updated_count?: number } | null)?.updated_count ?? 0)
  return { ok: true, sent: updated, message: `Тимчасовий fallback: заповнено опис у ${updated.toLocaleString('uk-UA')} товарів з meta_description.` }
}
