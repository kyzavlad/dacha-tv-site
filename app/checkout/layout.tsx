import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Оформлення замовлення | Дача TV',
  description: 'Оформлення замовлення в інтернет-магазині Дача TV.',
  robots: {
    index: false,
    follow: true,
  },
}

export default function CheckoutLayout({ children }: { children: ReactNode }) {
  return children
}
