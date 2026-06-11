'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { submitGeneralContact } from '@/actions/submitInquiry'
import { CTAButton } from '@/components/shared/CTAButton'
import { cn } from '@/lib/utils'

const ukrainianPhone = /^(\+380|0)\d{9}$/

const schema = z.object({
  name: z.string().min(2, "Ім'я має містити щонайменше 2 символи"),
  phone: z
    .string()
    .regex(ukrainianPhone, 'Введіть номер у форматі +380XXXXXXXXX або 0XXXXXXXXX'),
  message: z.string().max(500).optional(),
  source: z.string().optional(),
  _honeypot: z.string().max(0).optional(),
})

type FormData = z.infer<typeof schema>

interface GeneralContactFormProps {
  source?: string
}

export function GeneralContactForm({ source }: GeneralContactFormProps) {
  const [submitState, setSubmitState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { source: source || '', _honeypot: '' },
  })

  async function onSubmit(data: FormData) {
    setSubmitState('loading')
    setErrorMessage('')

    const formData = new FormData()
    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) formData.append(key, String(value))
    })

    const result = await submitGeneralContact(formData)

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
          Дякуємо!
        </h3>
        <p className="text-forest-700">
          Ми зв&apos;яжемося з вами найближчим часом.
        </p>
        <button
          type="button"
          onClick={() => setSubmitState('idle')}
          className="mt-4 text-sm text-forest-600 underline hover:no-underline"
        >
          Надіслати ще одне повідомлення
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

      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium text-bark mb-1">
          Ваше ім&apos;я <span className="text-red-500">*</span>
        </label>
        <input
          id="contact-name"
          type="text"
          {...register('name')}
          autoComplete="given-name"
          className={cn(
            'w-full px-4 py-3 rounded-lg border bg-white text-bark placeholder-bark/40',
            'focus:outline-none focus:ring-2 focus:ring-honey-500 focus:border-transparent',
            'min-h-[48px] text-base',
            errors.name ? 'border-red-400' : 'border-honey-200'
          )}
          placeholder="Ваше ім'я"
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="contact-phone" className="block text-sm font-medium text-bark mb-1">
          Телефон <span className="text-red-500">*</span>
        </label>
        <input
          id="contact-phone"
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
        {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>}
      </div>

      <div>
        <label htmlFor="contact-message" className="block text-sm font-medium text-bark mb-1">
          Повідомлення
        </label>
        <textarea
          id="contact-message"
          {...register('message')}
          rows={4}
          className={cn(
            'w-full px-4 py-3 rounded-lg border bg-white text-bark placeholder-bark/40',
            'focus:outline-none focus:ring-2 focus:ring-honey-500 focus:border-transparent',
            'text-base resize-none',
            errors.message ? 'border-red-400' : 'border-honey-200'
          )}
          placeholder="Ваше питання або повідомлення..."
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
        disabled={submitState === 'loading'}
        fullWidth
        size="lg"
      >
        {submitState === 'loading' ? 'Надсилаємо...' : 'Надіслати'}
      </CTAButton>

      <p className="text-xs text-bark/50 text-center">
        Відповідаємо протягом кількох годин
      </p>
    </form>
  )
}
