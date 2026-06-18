'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { adminSendSupplierTestOrder } from './actions'

// Admin-only button: re-sends this order to the supplier in TEST mode. Never
// creates a live order. Shows the supplier's response inline; the page revalidates
// so the stored result section refreshes.
export function SupplierTestButton({ orderId }: { orderId: string }) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [ok, setOk] = useState<boolean | null>(null)
  const router = useRouter()

  function send() {
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
      <button
        onClick={send}
        disabled={pending}
        className="text-sm bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-full disabled:opacity-40 transition-colors"
      >
        {pending ? 'Надсилання…' : '🧪 Надіслати тест постачальнику'}
      </button>
      <p className="text-xs text-gray-400">
        Завжди в режимі <span className="font-mono">test</span> — не створює реальне замовлення.
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
