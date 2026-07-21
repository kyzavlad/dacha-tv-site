'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CatalogImageManager } from '@/components/admin/CatalogImageManager'
import { METAL_ATTR_FIELDS, metalAttrDefaults } from '@/lib/catalog/metal'
import type { CatalogImageMeta } from '@/types'

// Dedicated, clean editor for manual metal-profile products. Shows ONLY fields
// that make sense for a hand-managed inquiry product — no supplier SKU
// diagnostics, no supplier price/image locks, no API-only fields. Metal is always
// ordered via inquiry (never add-to-cart), which the form states plainly and the
// server action enforces.

export interface MetalEditorProduct {
  id: string
  name_ua: string
  slug: string
  status: string
  short_description: string | null
  description: string | null
  description_ua: string | null
  price_uah: number | null
  compare_price_uah: number | null
  price_prefix: string | null
  unit_label: string | null
  is_featured: boolean
  display_order: number
  main_image_url: string | null
  main_image_alt: string | null
  image_metadata: CatalogImageMeta[] | null
  images: string[]
  attributes: Record<string, unknown> | null
}

// Full localized translation row (RU or EN). name / short_description /
// seo_description extend the SEO-only fields so each locale carries a complete
// translation, not just SEO metadata.
export interface MetalEditorTranslation {
  name: string | null
  short_description: string | null
  description: string | null
  seo_description: string | null
  meta_title: string | null
  meta_description: string | null
  seo_keywords: string | null
}

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-500'

export function MetalProductEditor({
  product, ru, en, action,
}: {
  product: MetalEditorProduct
  ru: MetalEditorTranslation | null
  en: MetalEditorTranslation | null
  action: (fd: FormData) => void
}) {
  const [uploading, setUploading] = useState(false)
  const attrDefaults = metalAttrDefaults(product.attributes)
  // Non-metal-structured attribute keys go into the Advanced JSON editor.
  const knownKeys = new Set(METAL_ATTR_FIELDS.map((f) => f.key))
  const advanced: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(product.attributes ?? {})) if (!knownKeys.has(k)) advanced[k] = v
  const advancedText = Object.keys(advanced).length ? JSON.stringify(advanced, null, 2) : ''

  // Preserve the dedicated primary image even when `images` contains only the
  // gallery (the generic editor stores these fields separately). Saving must
  // never silently drop or replace an existing main image.
  const initialImages = [...new Set(
    [product.main_image_url, ...product.images]
      .filter((u): u is string => typeof u === 'string' && u.trim() !== ''),
  )]

  return (
    <form action={action} className="space-y-6">
      {/* Metal badge + inquiry explanation */}
      <div className="rounded-xl border border-honey-200 bg-honey-50/60 p-4 flex items-start gap-3">
        <span className="text-[10px] font-semibold text-white bg-honey-600 rounded px-1.5 py-0.5 mt-0.5">Ручний товар</span>
        <p className="text-xs text-bark/70">
          Металопрофіль замовляється <strong>через запит</strong> (не через кошик). Ціна нижче — довідкова.
          Замовлення оформлюється зверненням клієнта, а не онлайн-оплатою.
        </p>
      </div>

      <Section title="Основне">
        <Field label="Назва (UA)"><input name="name_ua" defaultValue={product.name_ua ?? ''} className={inputCls} required /></Field>
        <Field label="Slug (URL)"><input name="slug" defaultValue={product.slug ?? ''} className={inputCls} /></Field>
        <Field label="Статус">
          <select name="status" defaultValue={product.status} className={inputCls}>
            <option value="draft">Чернетка</option>
            <option value="published">Опублікований</option>
            <option value="archived">Архів</option>
          </select>
        </Field>
      </Section>

      <Section title="Описи">
        <Field label="Короткий опис (картка + верх сторінки)"><textarea name="short_description" defaultValue={product.short_description ?? ''} rows={2} className={inputCls} /></Field>
        <Field label="Повний опис (блок «Опис»)"><textarea name="description" defaultValue={product.description ?? ''} rows={5} className={inputCls} /></Field>
        <Field label="Довгий SEO-текст (description_ua)"><textarea name="description_ua" defaultValue={product.description_ua ?? ''} rows={4} className={inputCls} /></Field>
      </Section>

      <Section title="Довідкова ціна (необовʼязково)">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ціна, грн"><input name="price_uah" defaultValue={product.price_uah ?? ''} inputMode="decimal" className={inputCls} /></Field>
          <Field label="Стара ціна, грн"><input name="compare_price_uah" defaultValue={product.compare_price_uah ?? ''} inputMode="decimal" className={inputCls} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Префікс ціни"><input name="price_prefix" defaultValue={product.price_prefix ?? ''} placeholder="напр. від" className={inputCls} /></Field>
          <Field label="Одиниця"><input name="unit_label" defaultValue={product.unit_label ?? ''} placeholder="напр. грн/м²" className={inputCls} /></Field>
        </div>
      </Section>

      <Section title="Характеристики">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {METAL_ATTR_FIELDS.map((f) => (
            <Field key={f.field} label={f.label}>
              <input name={f.field} defaultValue={attrDefaults[f.field] ?? ''} placeholder={f.placeholder} className={inputCls} />
            </Field>
          ))}
        </div>
        <details className="mt-2">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-800">Додатково: інші атрибути (JSON)</summary>
          <textarea name="attributes_advanced" defaultValue={advancedText} rows={4} className={`${inputCls} font-mono text-xs mt-2`} placeholder='{"Гарантія": "10 років"}' />
        </details>
      </Section>

      <Section title="Зображення">
        <CatalogImageManager
          initialImages={initialImages}
          initialImageMeta={product.image_metadata}
          altFallback={product.name_ua}
          onUploadingChange={setUploading}
          productId={product.id}
        />
      </Section>

      <TranslationSection locale="ru" title="Переклад (RU) — таблиця перекладів" t={ru} />
      <TranslationSection locale="en" title="Переклад (EN) — таблиця перекладів" t={en} />

      <Section title="Вітрина">
        <div className="grid grid-cols-2 gap-4 items-end">
          <Field label="Порядок показу"><input name="display_order" defaultValue={product.display_order ?? 0} inputMode="numeric" className={inputCls} /></Field>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" name="is_featured" defaultChecked={product.is_featured ?? false} className="rounded border-gray-300" />
            Рекомендований
          </label>
        </div>
      </Section>

      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={uploading}
          className="rounded-lg bg-gray-900 text-white text-sm font-semibold px-6 py-2.5 hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? 'Зачекайте…' : 'Зберегти'}
        </button>
        <Link href="/admin/catalog" className="text-sm text-gray-500 hover:text-gray-800">Скасувати</Link>
      </div>
    </form>
  )
}

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

// One locale's full translation block (name, short/full/SEO descriptions, meta).
// Field names are prefixed by locale so the server action reads ru_* / en_*.
function TranslationSection({ locale, title, t }: { locale: 'ru' | 'en'; title: string; t: MetalEditorTranslation | null }) {
  const p = locale
  const lang = locale.toUpperCase()
  return (
    <Section title={title}>
      <Field label={`Назва (${lang})`}><input name={`${p}_name`} defaultValue={t?.name ?? ''} className={inputCls} /></Field>
      <Field label={`Короткий опис (${lang})`}><textarea name={`${p}_short_description`} defaultValue={t?.short_description ?? ''} rows={2} className={inputCls} /></Field>
      <Field label={`Повний опис (${lang})`}><textarea name={`${p}_description`} defaultValue={t?.description ?? ''} rows={5} className={inputCls} /></Field>
      <Field label={`Довгий SEO-текст (${lang})`}><textarea name={`${p}_seo_description`} defaultValue={t?.seo_description ?? ''} rows={4} className={inputCls} /></Field>
      <Field label={`Meta Title (${lang})`}><input name={`${p}_meta_title`} defaultValue={t?.meta_title ?? ''} className={inputCls} /></Field>
      <Field label={`Meta Description (${lang})`}><textarea name={`${p}_meta_description`} defaultValue={t?.meta_description ?? ''} rows={2} className={inputCls} /></Field>
      <Field label={`SEO ключові слова (${lang})`}><input name={`${p}_seo_keywords`} defaultValue={t?.seo_keywords ?? ''} className={inputCls} /></Field>
    </Section>
  )
}
