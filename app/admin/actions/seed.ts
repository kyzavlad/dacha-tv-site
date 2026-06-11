'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase/admin'
import { STATIC_HONEY, STATIC_HONEY_SLUGS } from '@/lib/static-catalog'
import { STATIC_FLOWERS } from '@/lib/flowers-static'
import { STATIC_APIARY, STATIC_APIARY_SLUGS, STATIC_BEEKEEPER, STATIC_BEEKEEPER_SLUGS } from '@/lib/static-apiary'

const STATIC_SERVICES = [
  {
    name: 'Фотосесія у лаванді',
    slug: 'fotosesiia-lavandove-pole',
    short_description: 'Незабутні знімки на тлі квітучої лаванди на нашій садибі.',
    description: 'Проведіть фотосесію серед рядів квітучої лаванди на садибі Дача TV. Ідеально для сімейних знімків, лавстрі та особистих брендових фото. Ми надаємо локацію, а ви приводите свого фотографа або замовляєте через нас. Сезон — червень–липень.',
    price_uah: 1000,
    price_note: '₴1000 / година',
    duration_note: 'Від 1 години',
    status: 'active' as const,
    is_featured: true,
    display_order: 1,
    image_url: null,
  },
  {
    name: 'Альтанка на воді',
    slug: 'orenda-altanky-na-vodi',
    short_description: 'Затишна альтанка над ставком — для відпочинку, пікніка або особливого вечора.',
    description: 'Орендуйте нашу альтанку на воді для романтичного вечора, сімейного відпочинку або невеликого святкування. Альтанка розташована над тихим ставком у тіні дерев. Вміщує до 8 осіб. Безкоштовна риболовля включена.',
    price_uah: 3000,
    price_note: '₴3000 / доба',
    duration_note: 'Від 1 доби',
    status: 'active' as const,
    is_featured: true,
    display_order: 2,
    image_url: null,
  },
  {
    name: 'Послуги пасічника',
    slug: 'posluhy-pasisnyka',
    short_description: 'Консультація, обслуговування вуликів і практична допомога від досвідченого пасічника.',
    description: 'Наш пасічник з багаторічним досвідом допоможе з оглядом і обслуговуванням вуликів, консультацією щодо розведення бджіл, лікуванням сімей та підготовкою до зими. Послуги надаються на вашій або нашій пасіці.',
    price_uah: null,
    price_note: 'Ціна за домовленістю',
    duration_note: 'За домовленістю',
    status: 'active' as const,
    is_featured: false,
    display_order: 3,
    image_url: null,
  },
]

const LAUNCH_SITE_SETTINGS = {
  id: 1,
  phone: '+380967657772',
  phone_secondary: '+380934665801',
  address_full: 'Коротич, Пісочинська ОТГ, Харківська область, Україна',
  address_display: 'Коротич, Харківська обл.',
  telegram_url: null,
  youtube_url: 'https://www.youtube.com/@dacha_tv',
  featured_youtube_video_url: 'https://www.youtube.com/watch?v=Qwmi6Igjp4I',
  instagram_url: 'https://instagram.com/dachatv.store',
  facebook_url: 'https://facebook.com/kyzmenko.sergej',
  tiktok_url: 'https://tiktok.com/@vladkuzmenkosxy',
  hero_tagline: 'Мед прямо з вулика',
  hero_subtext: 'Натуральний мед із сімейної пасіки на Харківщині. Збираємо, фасуємо та відправляємо особисто.',
}

export interface SyncResult {
  ok: boolean
  message: string
  details: Record<string, string>
  missingTables: string[]
}

// Internal bootstrap — not exposed in admin UI. Run from CLI or one-off scripts only.
export async function syncCatalogAction(): Promise<void> {
  await syncCatalog()
  revalidatePath('/admin/honey')
  revalidatePath('/admin/apiary')
  revalidatePath('/admin/flowers')
  revalidatePath('/admin/beekeeper')
}

// Backfill image_url/alt for rows currently NULL — preserves admin-uploaded media on repeat syncs
async function backfillNullMedia(
  client: ReturnType<typeof getAdminClient>,
  table: string,
  items: Array<{ slug: string; image_url?: string | null; image_alt?: string | null }>,
): Promise<void> {
  for (const item of items) {
    if (!item.image_url) continue
    await client
      .from(table)
      .update({ image_url: item.image_url, image_alt: item.image_alt ?? null })
      .eq('slug', item.slug)
      .is('image_url', null)
  }
}

// Backfill product_media for products that have image_url but no media rows yet
async function backfillProductMedia(
  client: ReturnType<typeof getAdminClient>,
  section: string,
  table: string,
  items: Array<{ slug: string; image_url?: string | null; image_alt?: string | null }>,
): Promise<void> {
  for (const item of items) {
    if (!item.image_url) continue
    const { data: product } = await client.from(table).select('id').eq('slug', item.slug).single()
    if (!product?.id) continue
    const { data: existing } = await client
      .from('product_media')
      .select('id')
      .eq('product_section', section)
      .eq('product_id', product.id)
      .limit(1)
    if (existing && existing.length > 0) continue
    await client.from('product_media').insert({
      product_section: section,
      product_id: product.id,
      media_type: 'image',
      url: item.image_url,
      alt: item.image_alt ?? null,
      position: 0,
      is_primary: true,
    })
  }
}

export async function syncCatalog(): Promise<SyncResult> {
  const details: Record<string, string> = {}
  const missingTables: string[] = []

  try {
    const client = getAdminClient()

    // Honey — delete stale non-canonical rows, then upsert canonical set
    const { data: existingHoney } = await client.from('honey_products').select('slug')
    const staleHoney = (existingHoney ?? []).map((r: { slug: string }) => r.slug).filter((s) => !STATIC_HONEY_SLUGS.includes(s))
    if (staleHoney.length > 0) await client.from('honey_products').delete().in('slug', staleHoney)
    const honeyRows = STATIC_HONEY.map(({
      id: _id, created_at: _ca, updated_at: _ua,
      image_url: _img, image_alt: _alt, youtube_video_link: _yt,
      ...rest
    }) => rest)
    const { error: he } = await client
      .from('honey_products')
      .upsert(honeyRows, { onConflict: 'slug', ignoreDuplicates: false })
    if (!he) {
      await backfillNullMedia(client, 'honey_products', STATIC_HONEY)
      await backfillProductMedia(client, 'honey', 'honey_products', STATIC_HONEY).catch(() => {})
    }
    details.honey = he ? `Помилка: ${he.message}` : `Синхронізовано ${honeyRows.length} продуктів`

    // Apiary — delete stale non-canonical rows, then upsert canonical set (catalog fields only)
    const { data: existingApiary } = await client.from('apiary_products').select('slug')
    const staleApiary = (existingApiary ?? []).map((r: { slug: string }) => r.slug).filter((s) => !STATIC_APIARY_SLUGS.includes(s))
    if (staleApiary.length > 0) await client.from('apiary_products').delete().in('slug', staleApiary)
    const apiaryRows = STATIC_APIARY.map(({
      id: _id,
      image_url: _img, image_alt: _alt, gallery_images: _gal, youtube_video_url: _yt,
      ...rest
    }) => rest)
    const { error: ae } = await client
      .from('apiary_products')
      .upsert(apiaryRows, { onConflict: 'slug', ignoreDuplicates: false })
    if (!ae) {
      await backfillNullMedia(client, 'apiary_products', STATIC_APIARY)
      await backfillProductMedia(client, 'apiary', 'apiary_products', STATIC_APIARY).catch(() => {})
    }
    details.apiary = ae ? `Помилка: ${ae.message}` : `Синхронізовано ${apiaryRows.length} продуктів`

    // Beekeeper — delete stale non-canonical rows, then upsert canonical set (catalog fields only)
    const { data: existingBeekeeper } = await client.from('beekeeper_products').select('slug')
    const staleBeekeeper = (existingBeekeeper ?? []).map((r: { slug: string }) => r.slug).filter((s) => !STATIC_BEEKEEPER_SLUGS.includes(s))
    if (staleBeekeeper.length > 0) await client.from('beekeeper_products').delete().in('slug', staleBeekeeper)
    const beekeeperRows = STATIC_BEEKEEPER.map(({
      id: _id,
      image_url: _img, image_alt: _alt, gallery_images: _gal, youtube_video_url: _yt,
      ...rest
    }) => rest)
    const { error: bke } = await client
      .from('beekeeper_products')
      .upsert(beekeeperRows, { onConflict: 'slug', ignoreDuplicates: false })
    if (!bke) {
      await backfillProductMedia(client, 'beekeeper', 'beekeeper_products', STATIC_BEEKEEPER).catch(() => {})
    }
    details.beekeeper = bke ? `Помилка: ${bke.message}` : `Синхронізовано ${beekeeperRows.length} продуктів`

    // Flowers — delete stale rows, then upsert canonical set
    const flowerSlugs = STATIC_FLOWERS.map((f) => f.slug)
    const { data: existingFlowers } = await client.from('flower_products').select('slug')
    const staleFlowers = (existingFlowers ?? []).map((r: { slug: string }) => r.slug).filter((s) => !flowerSlugs.includes(s))
    if (staleFlowers.length > 0) await client.from('flower_products').delete().in('slug', staleFlowers)
    const flowerRows = STATIC_FLOWERS.map(({
      id: _id, created_at: _ca, updated_at: _ua,
      image_url: _img, image_alt: _alt, youtube_video_url: _yt,
      ...rest
    }) => rest)
    const { error: fe } = await client
      .from('flower_products')
      .upsert(flowerRows, { onConflict: 'slug', ignoreDuplicates: false })
    if (fe) {
      const isMissing = fe.message.includes('does not exist') || fe.message.includes('schema cache')
      if (isMissing) {
        missingTables.push('flower_products')
        details.flowers = 'ТАБЛИЦЯ ВІДСУТНЯ — потрібна міграція 016'
      } else {
        details.flowers = `Помилка: ${fe.message}`
      }
    } else {
      await backfillProductMedia(client, 'flowers', 'flower_products', STATIC_FLOWERS).catch(() => {})
      details.flowers = `Синхронізовано ${flowerRows.length} позицій`
    }

    // Site settings — upsert
    const { error: se } = await client
      .from('site_settings')
      .upsert(LAUNCH_SITE_SETTINGS, { onConflict: 'id', ignoreDuplicates: true })
    details.settings = se ? `Помилка: ${se.message}` : 'Синхронізовано'

    // Services — upsert canonical 3 rows (table must already exist via migration 035)
    const { error: srve } = await client.from('services').upsert(STATIC_SERVICES, { onConflict: 'slug', ignoreDuplicates: false })
    if (srve) {
      const isMissing = srve.message.includes('does not exist') || srve.message.includes('schema cache') || srve.message.includes('relation')
      if (isMissing) {
        missingTables.push('services')
        details.services = 'ТАБЛИЦЯ ВІДСУТНЯ — запустіть міграцію 035 в Supabase'
      } else {
        details.services = `Помилка: ${srve.message}`
      }
    } else {
      details.services = `Синхронізовано ${STATIC_SERVICES.length} послуг`
    }

    const allOk = Object.values(details).every((v) => !v.startsWith('Помилка') && !v.startsWith('ТАБЛИЦЯ'))
    return {
      ok: allOk,
      message: Object.entries(details).map(([k, v]) => `${k}: ${v}`).join(' | '),
      details,
      missingTables,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: msg, details: { error: msg }, missingTables: [] }
  }
}

// Legacy alias
export async function seedLaunchDataAction(): Promise<void> {
  await syncCatalogAction()
}

export async function seedLaunchData(): Promise<{ ok: boolean; message: string }> {
  const r = await syncCatalog()
  return { ok: r.ok, message: r.message }
}

export async function seedServicesAction(): Promise<void> {
  const client = getAdminClient()
  await client.from('services').upsert(STATIC_SERVICES, { onConflict: 'slug', ignoreDuplicates: false })
  revalidatePath('/services', 'layout')
  revalidatePath('/')
  redirect('/admin/services')
}
