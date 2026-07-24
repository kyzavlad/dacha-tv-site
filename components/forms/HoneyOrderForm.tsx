'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { submitHoneyOrder } from '@/actions/submitInquiry'
import { CTAButton } from '@/components/shared/CTAButton'
import { cn } from '@/lib/utils'
import { useLocale } from '@/lib/i18n/locale-context'
import { tr } from '@/lib/i18n/pages'

const ukrainianPhone = /^(\+380|0)\d{9}$/

const schema = z.object({
  name: z.string().min(2, "Ім'я має містити щонайменше 2 символи"),
  phone: z
    .string()
    .regex(ukrainianPhone, 'Введіть номер у форматі +380XXXXXXXXX або 0XXXXXXXXX'),
  product: z.string().min(1, 'Оберіть продукт'),
  packaging: z.string().optional(),
  quantity: z.string().optional(),
  message: z.string().max(500).optional(),
  source: z.string().optional(),
  _honeypot: z.string().max(0).optional(),
})

type FormData = z.infer<typeof schema>

interface HoneyOrderFormProps {
  preselectedProduct?: string
  packagingOptions?: string[]
  productOptions?: string[]
  source?: string
}

const DEFAULT_PRODUCTS = [
  'Акацієвий мед',
  'Липовий мед',
  'Соняшниковий мед',
  'Різнотравний мед',
  'Садовий мед',
  'Лісовий мед',
]

const DEFAULT_PACKAGING = ['1L пластик', '1L скло']

export function HoneyOrderForm({
  preselectedProduct,
  packagingOptions = DEFAULT_PACKAGING,
  productOptions = DEFAULT_PRODUCTS,
  source,
}: HoneyOrderFormProps) {
  const locale = useLocale()
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const localizedSchema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, tr({ uk: "Ім'я має містити щонайменше 2 символи", ru: 'Имя должно содержать минимум 2 символа' }, locale)),
        phone: z
          .string()
          .regex(ukrainianPhone, tr({ uk: 'Введіть номер у форматі +380XXXXXXXXX або 0XXXXXXXXX', ru: 'Введите номер в формате +380XXXXXXXXX или 0XXXXXXXXX' }, locale)),
        product: z.string().min(1, tr({ uk: 'Оберіть продукт', ru: 'Выберите продукт' }, locale)),
        packaging: z.string().optional(),
        quantity: z.string().optional(),
        message: z.string().max(500).optional(),
        source: z.string().optional(),
        _honeypot: z.string().max(0).optional(),
      }),
    [locale]
  )

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(localizedSchema),
    defaultValues: {
      product: preselectedProduct || '',
      source: source || '',
      _honeypot: '',
    },
  })

  async function onSubmit(data: FormData) {
    setSubmitState('loading')
    setErrorMessage('')

    const formData = new FormData()
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) formData.append(key, String(value))
    })

    const result = await submitHoneyOrder(formData)

    if (result.success) {
      setSubmitState('success')
      reset()
    } else {
      setSubmitState('error')
      setErrorMessage(result.error)
    }
  }

  if (submitState === 'success') {
    return (
      <div className="bg-forest-50 border border-forest-200 rounded-xl p-6 text-center">
        <div className="w-12 h-12 bg-forest-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-forest-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="font-serif text-xl font-semibold text-forest-800 mb-2">
          {tr({ uk: 'Дякуємо за заявку!', ru: 'Спасибо за заявку!' }, locale)}
        </h3>
        <p className="text-forest-700">
          {tr({ uk: "Ми зв'яжемося з вами найближчим часом.", ru: 'Мы свяжемся с вами в ближайшее время.' }, locale)}
        </p>
        <button
          type="button"
          onClick={() => setSubmitState('idle')}
          className="mt-4 text-sm text-forest-600 underline hover:no-underline"
        >
          {tr({ uk: 'Надіслати ще одну заявку', ru: 'Отправить ещё одну заявку' }, locale)}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="hidden" aria-hidden="true">
        <input {...register('_honeypot')} tabIndex={-1} autoComplete="off" />
        <input {...register('source')} type="hidden" />
      </div>

      {/* Name */}
      <div>
        <label htmlFor="honey-name" className="block text-sm font-medium text-bark mb-1">
          {tr({ uk: "Ваше ім'я", ru: 'Ваше имя' }, locale)} <span className="text-red-500">*</span>
        </label>
        <input
          id="honey-name"
          type="text"
          {...register('name')}
          autoComplete="given-name"
          className={cn(
            'w-full px-4 py-3 rounded-lg border bg-white text-bark placeholder-bark/40',
            'focus:outline-none focus:ring-2 focus:ring-honey-500 focus:border-transparent',
            'min-h-[48px] text-base',
            errors.name ? 'border-red-400' : 'border-honey-200'
          )}
          placeholder={tr({ uk: "Ваше ім'я", ru: 'Ваше имя' }, locale)}
        />
        {errors.name && (
          <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
        )}
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="honey-phone" className="block text-sm font-medium text-bark mb-1">
          {tr({ uk: 'Телефон', ru: 'Телефон' }, locale)} <span className="text-red-500">*</span>
        </label>
        <input
          id="honey-phone"
          type="tel"
          {...register('phone')}
          autoComplete="tel"
          className={cn(
            'w-full px-4 py-3 rounded-lg border bg-white text-bark placeholder-bark/40',
            'focus:outline-none focus:ring-2 focus:ring-honey-500 focus:border-transparent',
            'min-h-[48px] text-base',
            errors.phone ? 'border-red-400' : 'border-honey-200'
          )}
          placeholder="+380 XX XXX XXXX"
        />
        {errors.phone && (
          <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
        )}
      </div>

      {/* Product */}
      {!preselectedProduct && (
        <div>
          <label htmlFor="honey-product" className="block text-sm font-medium text-bark mb-1">
            {tr({ uk: 'Продукт', ru: 'Продукт' }, locale)} <span className="text-red-500">*</span>
          </label>
          <select
            id="honey-product"
            {...register('product')}
            className={cn(
              'w-full px-4 py-3 rounded-lg border bg-white text-bark',
              'focus:outline-none focus:ring-2 focus:ring-honey-500 focus:border-transparent',
              'min-h-[48px] text-base',
              errors.product ? 'border-red-400' : 'border-honey-200'
            )}
          >
            <option value="">{tr({ uk: 'Оберіть сорт', ru: 'Выберите сорт' }, locale)}</option>
            {productOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {errors.product && (
            <p className="mt-1 text-sm text-red-600">{errors.product.message}</p>
          )}
        </div>
      )}

      {preselectedProduct && (
        <input type="hidden" {...register('product')} value={preselectedProduct} />
      )}

      {/* Packaging */}
      {packagingOptions.length > 0 && (
        <div>
          <label htmlFor="honey-packaging" className="block text-sm font-medium text-bark mb-1">
            {tr({ uk: 'Упаковка', ru: 'Упаковка' }, locale)}
          </label>
          <select
            id="honey-packaging"
            {...register('packaging')}
            className="w-full px-4 py-3 rounded-lg border border-honey-200 bg-white text-bark focus:outline-none focus:ring-2 focus:ring-honey-500 focus:border-transparent min-h-[48px] text-base"
          >
            <option value="">{tr({ uk: 'Будь-яка', ru: 'Любая' }, locale)}</option>
            {packagingOptions.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>
      )}

      {/* Quantity */}
      <div>
        <label htmlFor="honey-quantity" className="block text-sm font-medium text-bark mb-1">
          {tr({ uk: 'Кількість', ru: 'Количество' }, locale)}
        </label>
        <input
          id="honey-quantity"
          type="text"
          {...register('quantity')}
          className="w-full px-4 py-3 rounded-lg border border-honey-200 bg-white text-bark placeholder-bark/40 focus:outline-none focus:ring-2 focus:ring-honey-500 focus:border-transparent min-h-[48px] text-base"
          placeholder={tr({ uk: 'Наприклад: 2 банки', ru: 'Например: 2 банки' }, locale)}
        />
      </div>

      {/* Message */}
      <div>
        <label htmlFor="honey-message" className="block text-sm font-medium text-bark mb-1">
          {tr({ uk: 'Повідомлення', ru: 'Сообщение' }, locale)}
        </label>
        <textarea
          id="honey-message"
          {...register('message')}
          rows={3}
          className={cn(
            'w-full px-4 py-3 rounded-lg border bg-white text-bark placeholder-bark/40',
            'focus:outline-none focus:ring-2 focus:ring-honey-500 focus:border-transparent',
            'text-base resize-none',
            errors.message ? 'border-red-400' : 'border-honey-200'
          )}
          placeholder={tr({ uk: 'Додаткові побажання...', ru: 'Дополнительные пожелания...' }, locale)}
        />
        {errors.message && (
          <p className="mt-1 text-sm text-red-600">{errors.message.message}</p>
        )}
      </div>

      {submitState === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      <CTAButton
        type="submit"
        disabled={submitState === 'loading'}
        fullWidth
        size="lg"
      >
        {submitState === 'loading'
          ? tr({ uk: 'Надсилаємо...', ru: 'Отправляем...' }, locale)
          : tr({ uk: 'Залишити заявку', ru: 'Оставить заявку' }, locale)}
      </CTAButton>

      <p className="text-xs text-bark/50 text-center">
        {tr({ uk: "Ми зв'яжемося з вами протягом кількох годин", ru: 'Мы свяжемся с вами в течение нескольких часов' }, locale)}
      </p>
    </form>
  )
}
