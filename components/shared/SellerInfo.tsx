import Link from 'next/link'

interface SellerInfoProps {
  compact?: boolean
}

export function SellerInfo({ compact = false }: SellerInfoProps) {
  if (compact) {
    return (
      <div className="text-xs text-gray-400 space-y-1">
        <p>ФОП Кузьменко Владислав Сергійович · Коротич, Харківська обл.</p>
        <p>
          Оплата після підтвердження замовлення ·{' '}
          <Link href="/delivery" className="underline hover:text-gray-600">
            Умови
          </Link>
        </p>
      </div>
    )
  }

  return (
    <section aria-label="Інформація про продавця" className="bg-gray-50 border border-gray-100 rounded-2xl p-6 space-y-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Реквізити продавця</h3>
      <dl className="space-y-3 text-sm">
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">Продавець</dt>
          <dd className="text-gray-800 font-medium">ФОП Кузьменко Владислав Сергійович</dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">Місцезнаходження</dt>
          <dd className="text-gray-800">Коротич, Харківська область, Україна</dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">Оплата</dt>
          <dd className="text-gray-800">Після підтвердження замовлення. Банківський переказ або готівка.</dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">IBAN</dt>
          <dd className="text-gray-800 font-mono tracking-wide break-all">UA383220010000026002350058954</dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">Претензії</dt>
          <dd className="text-gray-800">
            Звертайтеся за контактним номером або через{' '}
            <Link href="/contact" className="underline hover:text-gray-600">
              форму зворотного зв&apos;язку
            </Link>
            .
          </dd>
        </div>
      </dl>
    </section>
  )
}
