export const dynamic = 'force-dynamic'
import type { Metadata } from 'next'
import Link from 'next/link'
import { getPipelineStats } from '@/lib/catalog/pipeline'
import { getAutomationStatus, type AutomationStatus } from '@/lib/catalog/automation'
import { PipelineClient } from './PipelineClient'
import type { PipelineStats } from '@/lib/catalog/pipeline'

export const metadata: Metadata = { title: 'Адмін — Пайплайн', robots: 'noindex, nofollow' }

const EMPTY_STATS: PipelineStats = {
  supplierCategories: 0, supplierProductsNew: 0, catalogCategories: 0,
  catalogCategoriesPublished: 0, catalogProducts: 0, catalogProductsDraft: 0, catalogProductsPublished: 0,
  productsWithNoCategory: 0, numericCategoryNames: 0, numericSlugProductCount: 0, suspiciousPriceCount: 0,
}

const EMPTY_AUTO: AutomationStatus = {
  enabled: false, publishedCount: 0, queueCount: 0, maxProductsReached: false, lastRuns: [],
}

export type EnvStatus = {
  supplierUrl: boolean
  supplierKey: boolean
  cronSecret: boolean
  productSeoUrl: boolean
  categorySeoUrl: boolean
  supabaseUrl: boolean
  supabaseKey: boolean
}

export default async function PipelinePage() {
  const [stats, automation] = await Promise.all([
    getPipelineStats().catch(() => EMPTY_STATS),
    getAutomationStatus().catch(() => EMPTY_AUTO),
  ])

  const envStatus: EnvStatus = {
    supplierUrl:    !!process.env.SUPPLIER_API_URL,
    supplierKey:    !!process.env.SUPPLIER_API_KEY,
    cronSecret:     !!process.env.CRON_SECRET,
    productSeoUrl:  !!process.env.PRODUCT_SEO_CSV_URL,
    categorySeoUrl: !!process.env.CATEGORY_SEO_CSV_URL,
    supabaseUrl:    !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseKey:    !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  }

  const productSeoUrl  = process.env.PRODUCT_SEO_CSV_URL ?? ''
  const categorySeoUrl = process.env.CATEGORY_SEO_CSV_URL ?? ''

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-bark font-serif">Пайплайн публікації</h1>
        <p className="text-xs text-gray-500 mt-1">
          Щодня автоматично: 01:00 категорії → 02:00 SEO категорій → 03:00 API → 04:00 імпорт → 05:00 публікація → 06:00 SEO товарів.{' '}
          <Link href="/admin/catalog/setup" className="underline hover:text-gray-800">Разове налаштування</Link>
        </p>
      </div>
      <PipelineClient
        initialStats={stats}
        initialAutomation={automation}
        productSeoUrl={productSeoUrl}
        categorySeoUrl={categorySeoUrl}
        envStatus={envStatus}
        n8nSeoConfigured={!!process.env.N8N_SEO_WEBHOOK_URL}
      />
    </div>
  )
}
