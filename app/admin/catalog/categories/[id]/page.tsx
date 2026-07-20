export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAdminClient } from '@/lib/supabase/admin'
import { updateCatalogCategoryAction } from './actions'
import type { CatalogCategory } from '@/types'

export const metadata: Metadata = { title: 'Адмін: Редагування категорії', robots: 'noindex, nofollow' }

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<{ saved?: string }>
}

const EDIT_COLUMNS =
  'id, supplier_category_id, source, name_ua, slug, description, description_ua, image_url, meta_title, meta_description, seo_keywords, is_published, display_order, seo_manual_lock'

export default async function EditCatalogCategoryPage({ params, searchParams }: Props) {
  const { id } = await params
  const { saved } = await searchParams
  const client = getAdminClient()

  const [{ data: category }, { data: ruRow }] = await Promise.all([
    client.from('catalog_categories').select(EDIT_COLUMNS).eq('id', id).maybeSingle(),
    client.from('catalog_category_translations')
      .select('meta_title, meta_description, description, h1, seo_keywords')
      .eq('category_id', id).eq('locale', 'ru').maybeSingle(),
  ])

  if (!category) notFound()
  const c = category as unknown as CatalogCategory & { source?: string | null }
  const ru = ruRow as { meta_title: string | null; meta_description: string | null; description: string | null; h1: string | null; seo_keywords: string | null } | null
  const action = updateCatalogCategoryAction.bind(null, c.id)

  return (
    <div className="px-4 sm:px-6 py-8 max-w-3xl mx-auto">
      <div className="mb-5">
        <Link href="/admin/catalog/categories" className="text-xs text-gray-400 hover:text-gray-700">← Категорії</Link>
        <h1 className="text-xl font-bold text-gray-900 mt-1">Редагування категорії</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {c.source === 'manual' ? 'Ручна категорія' : 'Категорія постачальника'}
          {c.supplier_category_id && <> · ID постачальника: <span className="font-mono">{c.supplier_category_id}</span></>}
        </p>
      </div>

      {saved === '1' && (
        <div className="mb-4 rounded-lg bg-green-50 border border-green-200 px-4 py-2.5 text-sm text-green-800">Збережено ✓</div>
      )}

      <form action={action} className="space-y-6">
        <Section title="Основне">
          <Field label="Назва (UA)"><input name="name_ua" defaultValue={c.name_ua ?? ''} className={inputCls} required /></Field>
          <Field label="Slug (URL)"><input name="slug" defaultValue={c.slug ?? ''} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-4 items-end">
            <Field label="Порядок показу"><input name="display_order" defaultValue={c.display_order ?? 0} inputMode="numeric" className={inputCls} /></Field>
            <Check name="is_published" defaultChecked={c.is_published ?? false} label="Опублікована" />
          </div>
          <Field label="URL зображення"><input name="image_url" defaultValue={c.image_url ?? ''} className={inputCls} /></Field>
        </Section>

        <Section title="Тексти категорії">
          <Field label="Короткий вступ (картка + над сіткою) — description">
            <textarea name="description" defaultValue={c.description ?? ''} rows={2} className={inputCls} />
          </Field>
          <Field label="Довгий SEO-текст (під сіткою) — description_ua">
            <textarea name="description_ua" defaultValue={c.description_ua ?? ''} rows={5} className={inputCls} />
          </Field>
          <p className="text-xs text-gray-400">Короткий вступ показується на картці категорії та над сіткою товарів; довгий текст — унизу сторінки категорії.</p>
        </Section>

        <Section title="SEO (UA)">
          <Field label="Meta Title"><input name="meta_title" defaultValue={c.meta_title ?? ''} className={inputCls} /></Field>
          <Field label="Meta Description"><textarea name="meta_description" defaultValue={c.meta_description ?? ''} rows={2} className={inputCls} /></Field>
          <Field label="SEO ключові слова"><input name="seo_keywords" defaultValue={c.seo_keywords ?? ''} className={inputCls} /></Field>
          <Check name="seo_manual_lock" defaultChecked={c.seo_manual_lock ?? false} label="🔒 Замкнути SEO (автогенерація не змінюватиме)" />
        </Section>

        <Section title="SEO (RU) — таблиця перекладів">
          <Field label="Meta Title (RU)"><input name="ru_meta_title" defaultValue={ru?.meta_title ?? ''} className={inputCls} /></Field>
          <Field label="Meta Description (RU)"><textarea name="ru_meta_description" defaultValue={ru?.meta_description ?? ''} rows={2} className={inputCls} /></Field>
          <Field label="H1 (RU)"><input name="ru_h1" defaultValue={ru?.h1 ?? ''} className={inputCls} /></Field>
          <Field label="Опис (RU)"><textarea name="ru_description" defaultValue={ru?.description ?? ''} rows={4} className={inputCls} /></Field>
          <Field label="SEO ключові слова (RU)"><input name="ru_seo_keywords" defaultValue={ru?.seo_keywords ?? ''} className={inputCls} /></Field>
        </Section>

        <div className="flex items-center gap-3 pt-2">
          <button type="submit" className="rounded-lg bg-gray-900 text-white text-sm font-semibold px-6 py-2.5 hover:bg-gray-700 transition-colors">Зберегти</button>
          <Link href="/admin/catalog/categories" className="text-sm text-gray-500 hover:text-gray-800">Скасувати</Link>
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
function Check({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="rounded border-gray-300" />
      {label}
    </label>
  )
}
