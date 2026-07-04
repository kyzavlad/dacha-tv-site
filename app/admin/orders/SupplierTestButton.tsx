'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminSendSupplierTestOrder } from './actions'

// Admin-only button: re-sends this order to the supplier in TEST mode ONLY. The
// server action hard-codes mode=test, so it can NEVER create a live supplier
// order regardless of SUPPLIER_ORDER_MODE. It DOES overwrite the stored supplier
// result with the test outcome, so on an order that was already sent live we
// warn and require an explicit confirmation first.
export function SupplierTestButton({
  orderId,
  sentLive = false,
}: {
  orderId: string
  sentLive?: boolean
}) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState<boolean | null>(null)
  const router = useRouter()

  function send() {
    // Guard: on a live-sent order, the test send replaces the saved live result.
    if (sentLive) {
      const confirmed = window.confirm(
        'Це замовлення вже надіслано постачальнику в LIVE-режимі.\n\n' +
          'Тестове надсилання НЕ створить нове реальне замовлення, але замінить ' +
          'збережений результат постачальника цим тестом. Продовжити?',
      )
      if (!confirmed) return
    }
    setMessage(null)
    setOk(null)
    start(async () => {
      const result = await adminSendSupplierTestOrder(orderId)
      setOk(result.success)
      setMessage(result.message)
      router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      {sentLive && (
        <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 leading-relaxed">
          ⚠ Це замовлення вже надіслано в <span className="font-semibold">LIVE</span>-режимі.
          Кнопка нижче надсилає лише <span className="font-mono">test</span> і замінить збережений
          результат постачальника — реальне замовлення не створюється.
        </p>
      )}
      <button
        onClick={send}
        disabled={pending}
        className="text-sm bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-full disabled:opacity-40 transition-colors"
      >
        {pending ? 'Надсилання…' : '🧪 Тестове надсилання постачальнику'}
      </button>
      <p className="text-xs text-gray-400">
        Завжди в режимі <span className="font-mono">test</span> — не створює і не змінює реального
        замовлення у постачальника.
      </p>
      {message && (
        <p
          className={`text-xs rounded-lg px-3 py-2 border ${
            ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          {ok ? '✓' : '✗'} {message}
        </p>
      )}
    </div>
  )
}
