export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase/admin'
import { updateCatalogProductAction, updateMetalProductAction } from './actions'
import { MetalProductEditor } from './MetalProductEditor'
import { isMetalProduct } from '@/lib/catalog/metal'
import type { CatalogProduct } from '@/types'

export const metadata: Metadata = { title: 'Адмін: Редагування товару', robots: 'noindex, nofollow' }

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string; warn?: string; error?: string }>
}

const EDIT_COLUMNS =
  'id, supplier_product_id, supplier_sku, source, lead_type, name_ua, name, slug, category_slug, short_description, description, description_ua, price_uah, compare_price_uah, price_prefix, unit_label, status, main_image_url, images, attributes, meta_title, meta_description, seo_keywords, is_featured, display_order, price_manual_lock, image_manual_lock, seo_manual_lock'

function joinImages(images: unknown): string {
  if (Array.isArray(images)) return images.filter((x) => typeof x === 'string').join('\n')
  return ''
}

export default async function EditCatalogProductPage({ params, searchParams }: Props) {
  const { id } = await params
  const { saved, warn, error } = await searchParams
  const client = getAdminClient()

  const [{ data: product }, { data: categories }, { data: ruRow }] = await Promise.all([
    client.from('catalog_products').select(EDIT_COLUMNS).eq('id', id).maybeSingle(),
    client.from('catalog_categories').select('slug, name_ua').order('name_ua', { ascending: true }).limit(2000),
    client.from('catalog_product_translations')
      .select('meta_title, meta_description, description, seo_keywords')
      .eq('product_id', id).eq('locale', 'ru').maybeSingle(),
  ])

  if (!product) notFound()
  const p = product as unknown as CatalogProduct & { name?: string | null }
  const cats = (categories ?? []) as { slug: string; name_ua: string }[]
  const ru = ruRow as { meta_title: string | null; meta_description: string | null; description: string | null; seo_keywords: string | null } | null
  const isManual = p.source === 'manual'
  const metal = isMetalProduct(p)
  const action = updateCatalogProductAction.bind(null, p.id)

  const banners = (
    <>
      {saved === '1' && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-800">Збережено ✓</div>
      )}
      {error === '1' && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-800">
          Не вдалося зберегти — зміни не застосовано. Перевірте дані та спробуйте ще раз (деталі у логах сервера).
        </div>
      )}
      {warn === 'attributes' && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
          Атрибути не збережено: некоректний JSON. Решту полів збережено.
        </div>
      )}
    </>
  )

  // Metal-profile products get a dedicated, clean editor (no supplier-only UI).
  if (metal) {
    return (
      <div className="px-4 sm:px-6 py-8 max-w-3xl mx-auto">
        <div className="mb-5">
          <Link href="/admin/catalog" className="text-xs text-gray-400 hover:text-gray-700">← Каталог</Link>
          <h1 className="text-xl font-bold text-gray-900 mt-1">Редагування металопрофілю</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ручний товар · замовлення через запит</p>
        </div>
        {banners}
        <MetalProductEditor
          product={{
            id: p.id,
            name_ua: p.name_ua,
            slug: p.slug,
            status: p.status,
            short_description: p.short_description ?? null,
            description: p.description ?? null,
            description_ua: p.description_ua ?? null,
            price_uah: p.price_uah ?? null,
            compare_price_uah: p.compare_price_uah ?? null,
            price_prefix: p.price_prefix ?? null,
            unit_label: p.unit_label ?? null,
            is_featured: p.is_featured ?? false,
            display_order: p.display_order ?? 0,
            main_image_url: p.main_image_url ?? null,
            images: Array.isArray(p.images) ? p.images : [],
            attributes: p.attributes ?? null,
          }}
          ru={ru}
          action={updateMetalProductAction.bind(null, p.id)}
        />
      </div>
    )
  }

  return (
    <div className="px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      <div className="mb-5">
        <Link href="/admin/catalog" className="text-xs text-gray-400 hover:text-gray-700">← Каталог</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Редагування товару</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {isManual ? 'Ручний товар' : 'Товар постачальника'} · SKU: <span className="font-mono">{p.supplier_sku ?? '—'}</span>
        </p>
      </div>

      {banners}

      <form action={action} className="space-y-6">
        {/* Diagnostics (read-only) */}
        <Section title="Діагностика (тільки для читання)">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <ReadOnly label="Джерело" value={p.source ?? 'supplier'} />
            <ReadOnly label="Supplier SKU" value={p.supplier_sku ?? '—'} />
          </div>
          {!isManual && (
            <p className="text-xs text-gray-400">
              Це товар постачальника. Увімкніть відповідні замки нижче, щоб щоденний імпорт не перезаписував ваші ручні зміни ціни чи зображень.
            </p>
          )}
        </Section>

        {/* Core */}
        <Section title="Основне">
          <Field label="Назва (UA)"><input name="name_ua" defaultValue={p.name_ua ?? ''} className={inputCls} required /></Field>
          <Field label="Slug (URL)"><input name="slug" defaultValue={p.slug ?? ''} className={inputCls} /></Field>
          <Field label="Категорія">
            <select name="category_slug" defaultValue={p.category_slug ?? ''} className={inputCls}>
              <option value="">— без категорії —</option>
              {cats.map((c) => <option key={c.slug} value={c.slug}>{c.name_ua} ({c.slug})</option>)}
            </select>
          </Field>
          <Field label="Статус">
            <select name="status" defaultValue={p.status} className={inputCls}>
              <option value="draft">Чернетка</option>
              <option value="published">Опублікований</option>
              <option value="archived">Архів</option>
            </select>
          </Field>
        </Section>

        {/* Descriptions */}
        <Section title="Описи (UA)">
          <Field label="Короткий опис (картка + верх сторінки)"><textarea name="short_description" defaultValue={p.short_description ?? ''} rows={2} className={inputCls} /></Field>
          <Field label="Повний опис (блок «Опис»)"><textarea name="description" defaultValue={p.description ?? ''} rows={5} className={inputCls} /></Field>
          <Field label="Довгий SEO-текст (description_ua)"><textarea name="description_ua" defaultValue={p.description_ua ?? ''} rows={4} className={inputCls} /></Field>
        </Section>

        {/* Pricing */}
        <Section title="Ціна">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Ціна, грн"><input name="price_uah" defaultValue={p.price_uah ?? ''} inputMode="decimal" className={inputCls} /></Field>
            <Field label="Стара ціна, грн"><input name="compare_price_uah" defaultValue={p.compare_price_uah ?? ''} inputMode="decimal" className={inputCls} /></Field>
          </div>
          <Check name="price_manual_lock" defaultChecked={p.price_manual_lock ?? false} label="🔒 Замкнути ціну (імпорт постачальника не змінюватиме)" />
        </Section>

        {/* Images */}
        <Section title="Зображення">
          <Field label="Головне зображення (URL)"><input name="main_image_url" defaultValue={p.main_image_url ?? ''} className={inputCls} /></Field>
          <Field label="Галерея (по одному URL на рядок)"><textarea name="images" defaultValue={joinImages(p.images)} rows={4} className={`${inputCls} font-mono text-xs`} /></Field>
          <Check name="image_manual_lock" defaultChecked={p.image_manual_lock ?? false} label="🔒 Замкнути зображення (імпорт постачальника не змінюватиме)" />
        </Section>

        {/* Attributes */}
        <Section title="Атрибути (JSON)">
          <Field label="attributes"><textarea name="attributes" defaultValue={p.attributes ? JSON.stringify(p.attributes, null, 2) : ''} rows={4} className={`${inputCls} font-mono text-xs`} placeholder='{"колір": "чорний"}' /></Field>
        </Section>

        {/* SEO UA */}
        <Section title="SEO (UA)">
          <Field label="Meta Title"><input name="meta_title" defaultValue={p.meta_title ?? ''} className={inputCls} /></Field>
          <Field label="Meta Description"><textarea name="meta_description" defaultValue={p.meta_description ?? ''} rows={2} className={inputCls} /></Field>
          <Field label="SEO ключові слова"><input name="seo_keywords" defaultValue={p.seo_keywords ?? ''} className={inputCls} /></Field>
          <Check name="seo_manual_lock" defaultChecked={p.seo_manual_lock ?? false} label="🔒 Замкнути SEO (автогенерація не змінюватиме)" />
        </Section>

        {/* SEO RU (translation table) */}
        <Section title="SEO (RU) — таблиця перекладів">
          <Field label="Meta Title (RU)"><input name="ru_meta_title" defaultValue={ru?.meta_title ?? ''} className={inputCls} /></Field>
          <Field label="Meta Description (RU)"><textarea name="ru_meta_description" defaultValue={ru?.meta_description ?? ''} rows={2} className={inputCls} /></Field>
          <Field label="Опис (RU)"><textarea name="ru_description" defaultValue={ru?.description ?? ''} rows={4} className={inputCls} /></Field>
          <Field label="SEO ключові слова (RU)"><input name="ru_seo_keywords" defaultValue={ru?.seo_keywords ?? ''} className={inputCls} /></Field>
        </Section>

        {/* Merchandising */}
        <Section title="Вітрина">
          <div className="grid grid-cols-2 gap-4 items-end">
            <Field label="Порядок показу"><input name="display_order" defaultValue={p.display_order ?? 0} inputMode="numeric" className={inputCls} /></Field>
            <Check name="is_featured" defaultChecked={p.is_featured ?? false} label="Рекомендований" />
          </div>
        </Section>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="rounded-lg bg-gray-900 text-white text-sm font-semibold px-6 py-2.5 hover:bg-gray-700 transition-colors">
            Зберегти
          </button>
          <Link href="/admin/catalog" className="text-sm text-gray-500 hover:text-gray-800">Скасувати</Link>
        </div>
      </form>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-500'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 space-y-3">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
      {children}
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500 mb-1 block">{label}</span>
      {children}
    </label>
  )
}
function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-medium text-gray-400 block">{label}</span>
      <span className="text-sm text-gray-700 font-mono">{value}</span>
    </div>
  )
}
function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="rounded border-gray-300" />
      {label}
    </label>
  )
}
