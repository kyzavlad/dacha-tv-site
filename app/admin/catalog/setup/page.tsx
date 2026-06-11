export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getPipelineStats } from '@/lib/catalog/pipeline'
import { SetupClient } from './SetupClient'
import type { PipelineStats } from '@/lib/catalog/pipeline'

export const metadata: Metadata = { title: 'Адмін — Налаштування каталогу', robots: 'noindex, nofollow' }

const EMPTY: PipelineStats = {
  supplierCategories: 0, supplierProductsNew: 0, catalogCategories: 0,
  catalogCategoriesPublished: 0, catalogProducts: 0, catalogProductsDraft: 0, catalogProductsPublished: 0,
  productsWithNoCategory: 0, numericCategoryNames: 0, numericSlugProductCount: 0, suspiciousPriceCount: 0,
}

export default async function SetupPage() {
  let stats: PipelineStats = EMPTY
  let statsError: string | null = null
  try {
    stats = await getPipelineStats()
  } catch (e) {
    statsError = e instanceof Error
      ? `getPipelineStats → ${e.message}`
      : `getPipelineStats → ${String(e)}`
  }

  const categorySeoUrl = process.env.CATEGORY_SEO_CSV_URL ?? ''
  const productSeoUrl  = process.env.PRODUCT_SEO_CSV_URL ?? ''

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="mb-5">
        <div className="flex items-center gap-3 mb-1">
          <Link href="/admin/catalog/pipeline" className="text-xs text-gray-400 hover:text-gray-700">← Пайплайн</Link>
        </div>
        <h1 className="text-xl font-bold text-bark font-serif">Налаштування каталогу</h1>
        <p className="text-xs text-gray-500 mt-1">
          Разові кроки для первинного налаштування. Після першого успішного запуску категорії обслуговуються
          автоматично (01:00–02:00 UTC щодня).
        </p>
      </div>

      {statsError && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-xl p-3 text-xs">
          <div className="font-semibold text-red-700 mb-0.5">Помилка завантаження статистики</div>
          <div className="font-mono text-red-600 break-all">{statsError}</div>
          <div className="mt-1 text-red-500">
            Перевірте NEXT_PUBLIC_SUPABASE_URL та SUPABASE_SERVICE_ROLE_KEY у Vercel env vars.
          </div>
        </div>
      )}

      <SetupClient
        initialStats={stats}
        categorySeoUrl={categorySeoUrl}
        productSeoUrl={productSeoUrl}
      />
    </div>
  )
}
