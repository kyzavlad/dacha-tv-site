'use client'

import { useState, useTransition } from 'react'
import { submitFlowerInquiry } from '@/actions/submitInquiry'
import { useLocale } from '@/lib/i18n/locale-context'
import { tr } from '@/lib/i18n/pages'

interface FlowerInquiryFormProps {
  preselectedProduct?: string
  source?: string
}

export function FlowerInquiryForm({ preselectedProduct, source }: FlowerInquiryFormProps) {
  const locale = useLocale()
  const [isPending, startTransition] = useTransition()
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await submitFlowerInquiry(formData)
      setResult(res)
    })
  }

  if (result?.success) {
    return (
      <div className="text-center py-8">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-green-100 mb-4">
          <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h3 className="font-serif text-xl font-bold text-gray-900 mb-2">{tr({ uk: 'Заявку отримано!', ru: 'Заявка получена!' }, locale)}</h3>
        <p className="text-gray-600 text-sm mb-4">
          {tr({ uk: "Ми зв'яжемося з вами найближчим часом.", ru: 'Мы свяжемся с вами в ближайшее время.' }, locale)}
        </p>
        <button
          onClick={() => setResult(null)}
          className="text-sm text-gray-500 underline hover:no-underline"
        >
          {tr({ uk: 'Надіслати ще одну', ru: 'Отправить ещё одну' }, locale)}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input type="text" name="_honeypot" className="hidden" tabIndex={-1} aria-hidden="true" />
      {source && <input type="hidden" name="source" value={source} />}
      {preselectedProduct && <input type="hidden" name="product" value={preselectedProduct} />}

      {result?.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          {result.error}
        </div>
      )}

      <div>
        <label htmlFor="flower-name" className="block text-sm font-semibold text-gray-800 mb-1">
          {tr({ uk: "Ваше ім'я", ru: 'Ваше имя' }, locale)} <span className="text-red-500">*</span>
        </label>
        <input
          id="flower-name"
          name="name"
          type="text"
          required
          autoComplete="name"
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gray-400"
          placeholder={tr({ uk: "Ім'я", ru: 'Имя' }, locale)}
        />
      </div>

      <div>
        <label htmlFor="flower-phone" className="block text-sm font-semibold text-gray-800 mb-1">
          {tr({ uk: 'Номер телефону', ru: 'Номер телефона' }, locale)} <span className="text-red-500">*</span>
        </label>
        <input
          id="flower-phone"
          name="phone"
          type="tel"
          required
          autoComplete="tel"
          pattern="(\+380|0)\d{9}"
          title={tr({ uk: 'Введіть номер у форматі +380XXXXXXXXX або 0XXXXXXXXX', ru: 'Введите номер в формате +380XXXXXXXXX или 0XXXXXXXXX' }, locale)}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gray-400"
          placeholder="+380 XX XXX XXXX"
        />
      </div>

      {!preselectedProduct && (
        <div>
          <label htmlFor="flower-product" className="block text-sm font-semibold text-gray-800 mb-1">
            {tr({ uk: 'Яка квітка вас цікавить?', ru: 'Какой цветок вас интересует?' }, locale)}
          </label>
          <input
            id="flower-product"
            name="product"
            type="text"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gray-400"
            placeholder={tr({ uk: 'Назва або опис', ru: 'Название или описание' }, locale)}
          />
        </div>
      )}

      <div>
        <label htmlFor="flower-message" className="block text-sm font-semibold text-gray-800 mb-1">
          {tr({ uk: 'Повідомлення', ru: 'Сообщение' }, locale)} <span className="text-gray-400 font-normal">{tr({ uk: "(необов'язково)", ru: '(необязательно)' }, locale)}</span>
        </label>
        <textarea
          id="flower-message"
          name="message"
          rows={3}
          maxLength={500}
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-gray-400 resize-none"
          placeholder={tr({ uk: 'Кількість, термін, побажання...', ru: 'Количество, срок, пожелания...' }, locale)}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="w-full bg-gray-900 text-white font-semibold py-4 px-6 rounded-xl hover:bg-gray-800 transition-colors min-h-[52px] text-base disabled:opacity-60"
      >
        {isPending
          ? tr({ uk: 'Надсилаємо...', ru: 'Отправляем...' }, locale)
          : tr({ uk: 'Надіслати заявку', ru: 'Отправить заявку' }, locale)}
      </button>
    </form>
  )
}
