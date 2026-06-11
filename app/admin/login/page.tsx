'use client'

import { useState, FormEvent } from 'react'

export default function AdminLoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })

    if (res.ok) {
      // Hard redirect so the middleware reads the fresh cookie correctly.
      window.location.href = '/admin'
    } else {
      setError('Невірний пароль')
      setLoading(false)
    }
  }

  return (
    <div className="bg-cream min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-serif text-3xl font-bold text-bark mb-2">
            Дача TV
          </h1>
          <p className="text-bark/60">Адмін-панель</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl p-8 shadow-sm border border-honey-100"
        >
          <div className="mb-5">
            <label htmlFor="password" className="block text-sm font-medium text-bark mb-2">
              Пароль
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-honey-200 bg-white text-bark focus:outline-none focus:ring-2 focus:ring-honey-500 focus:border-transparent min-h-[48px] text-base"
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-honey-700 hover:bg-honey-800 text-white font-semibold py-3 px-6 rounded-lg transition-colors min-h-[48px] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? 'Входимо...' : 'Увійти'}
          </button>
        </form>
      </div>
    </div>
  )
}
