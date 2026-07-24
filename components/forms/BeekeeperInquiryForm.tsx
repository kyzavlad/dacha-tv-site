'use client'

import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { submitBeekeeperInquiry } from '@/actions/submitInquiry'
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
  productType: z.string().min(1, 'Оберіть тип продукту'),
  breed: z.string().optional(),
  quantity: z.string().optional(),
  timing: z.string().optional(),
  message: z.string().max(500).optional(),
  source: z.string().optional(),
  _honeypot: z.string().max(0).optional(),
})

type FormData = z.infer<typeof schema>

interface BeekeeperInquiryFormProps {
  preselectedProductType?: string
  source?: string
}

const PRODUCT_TYPES = [
  { value: 'bee_packages', label: 'Бджолопакети' },
  { value: 'bee_colonies', label: "Бджолосім'ї" },
  { value: 'empty_hives', label: 'Порожні вулики' },
  { value: 'hives_with_bees', label: 'Вулики з бджолами' },
]

const BREEDS = [
  'Buckfast',
  'Українська степова',
  'Карніка',
  'Не визначився',
]

export function BeekeeperInquiryForm({ preselectedProductType, source }: BeekeeperInquiryFormProps) {
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
        productType: z.string().min(1, tr({ uk: 'Оберіть тип продукту', ru: 'Выберите тип продукта' }, locale)),
        breed: z.string().optional(),
        quantity: z.string().optional(),
        timing: z.string().optional(),
        message: z.string().max(500).optional(),
        source: z.string().optional(),
        _honeypot: z.string().max(0).optional(),
      }),
    [locale]
  )

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(localizedSchema),
    defaultValues: {
      productType: preselectedProductType || '',
      source: source || '',
      _honeypot: '',
    },
  })

  const productType = watch('productType')
  const showBreed = productType === 'bee_packages'

  async function onSubmit(data: FormData) {
    setSubmitState('loading')
    setErrorMessage('')

    const formData = new FormData()
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) formData.append(key, String(value))
    })

    const result = await submitBeekeeperInquiry(formData)

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
          {tr({ uk: 'Заявку прийнято!', ru: 'Заявка принята!' }, locale)}
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
        <label htmlFor="bee-name" className="block text-sm font-medium text-bark mb-1">
          {tr({ uk: "Ваше ім'я", ru: 'Ваше имя' }, locale)} <span className="text-red-500">*</span>
        </label>
        <input
          id="bee-name"
          type="text"
          {...register('name')}
          autoComplete="given-name"
          className={cn(
            'w-full px-4 py-3 rounded-lg border bg-white text-bark placeholder-bark/40',
            'focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent',
            'min-h-[48px] text-base',
            errors.name ? 'border-red-400' : 'border-forest-200'
          )}
          placeholder={tr({ uk: "Ваше ім'я", ru: 'Ваше имя' }, locale)}
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
      </div>

      {/* Phone */}
      <div>
        <label htmlFor="bee-phone" className="block text-sm font-medium text-bark mb-1">
          {tr({ uk: 'Телефон', ru: 'Телефон' }, locale)} <span className="text-red-500">*</span>
        </label>
        <input
          id="bee-phone"
          type="tel"
          {...register('phone')}
          autoComplete="tel"
          className={cn(
            'w-full px-4 py-3 rounded-lg border bg-white text-bark placeholder-bark/40',
            'focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent',
            'min-h-[48px] text-base',
            errors.phone ? 'border-red-400' : 'border-forest-200'
          )}
          placeholder="+380 XX XXX XXXX"
        />
        {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>}
      </div>

      {/* Product type */}
      {!preselectedProductType && (
        <div>
          <label htmlFor="bee-product-type" className="block text-sm font-medium text-bark mb-1">
            {tr({ uk: 'Що вас цікавить', ru: 'Что вас интересует' }, locale)} <span className="text-red-500">*</span>
          </label>
          <select
            id="bee-product-type"
            {...register('productType')}
            className={cn(
              'w-full px-4 py-3 rounded-lg border bg-white text-bark',
              'focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent',
              'min-h-[48px] text-base',
              errors.productType ? 'border-red-400' : 'border-forest-200'
            )}
          >
            <option value="">{tr({ uk: 'Оберіть', ru: 'Выберите' }, locale)}</option>
            {PRODUCT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {errors.productType && (
            <p className="mt-1 text-sm text-red-600">{errors.productType.message}</p>
          )}
        </div>
      )}

      {preselectedProductType && (
        <input type="hidden" {...register('productType')} value={preselectedProductType} />
      )}

      {/* Breed — only for bee packages */}
      {(showBreed || preselectedProductType === 'bee_packages') && (
        <div>
          <label htmlFor="bee-breed" className="block text-sm font-medium text-bark mb-1">
            {tr({ uk: 'Порода бджіл', ru: 'Порода пчёл' }, locale)}
          </label>
          <select
            id="bee-breed"
            {...register('breed')}
            className="w-full px-4 py-3 rounded-lg border border-forest-200 bg-white text-bark focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent min-h-[48px] text-base"
          >
            <option value="">{tr({ uk: 'Будь-яка', ru: 'Любая' }, locale)}</option>
            {BREEDS.map((b) => (
              <option key={b} value={b}>
                {b === 'Не визначився' ? tr({ uk: 'Не визначився', ru: 'Не определился' }, locale) : b}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Quantity */}
      <div>
        <label htmlFor="bee-quantity" className="block text-sm font-medium text-bark mb-1">
          {tr({ uk: 'Орієнтовна кількість', ru: 'Ориентировочное количество' }, locale)}
        </label>
        <input
          id="bee-quantity"
          type="text"
          {...register('quantity')}
          className="w-full px-4 py-3 rounded-lg border border-forest-200 bg-white text-bark placeholder-bark/40 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent min-h-[48px] text-base"
          placeholder={tr({ uk: 'Наприклад: 2–3 пакети', ru: 'Например: 2–3 пакета' }, locale)}
        />
      </div>

      {/* Timing */}
      <div>
        <label htmlFor="bee-timing" className="block text-sm font-medium text-bark mb-1">
          {tr({ uk: 'Коли потрібно', ru: 'Когда нужно' }, locale)}
        </label>
        <input
          id="bee-timing"
          type="text"
          {...register('timing')}
          className="w-full px-4 py-3 rounded-lg border border-forest-200 bg-white text-bark placeholder-bark/40 focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent min-h-[48px] text-base"
          placeholder={tr({ uk: 'Наприклад: навесні, у квітні', ru: 'Например: весной, в апреле' }, locale)}
        />
      </div>

      {/* Message */}
      <div>
        <label htmlFor="bee-message" className="block text-sm font-medium text-bark mb-1">
          {tr({ uk: 'Повідомлення', ru: 'Сообщение' }, locale)}
        </label>
        <textarea
          id="bee-message"
          {...register('message')}
          rows={3}
          className={cn(
            'w-full px-4 py-3 rounded-lg border bg-white text-bark placeholder-bark/40',
            'focus:outline-none focus:ring-2 focus:ring-forest-500 focus:border-transparent',
            'text-base resize-none',
            errors.message ? 'border-red-400' : 'border-forest-200'
          )}
          placeholder={tr({ uk: 'Додаткові запитання...', ru: 'Дополнительные вопросы...' }, locale)}
        />
        {errors.message && <p className="mt-1 text-sm text-red-600">{errors.message.message}</p>}
      </div>

      {submitState === 'error' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">{errorMessage}</p>
        </div>
      )}

      <CTAButton
        type="submit"
        variant="secondary"
        disabled={submitState === 'loading'}
        fullWidth
        size="lg"
      >
        {submitState === 'loading'
          ? tr({ uk: 'Надсилаємо...', ru: 'Отправляем...' }, locale)
          : tr({ uk: 'Залишити заявку', ru: 'Оставить заявку' }, locale)}
      </CTAButton>

      <p className="text-xs text-bark/50 text-center">
        {tr({ uk: "Ми зв'яжемося з вами найближчим часом", ru: 'Мы свяжемся с вами в ближайшее время' }, locale)}
      </p>
    </form>
  )
}
