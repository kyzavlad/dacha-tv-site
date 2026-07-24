import Link from 'next/link'
import { getRequestLocale, localizedPath } from '@/lib/i18n'
import { tr } from '@/lib/i18n/pages'

interface SellerInfoProps {
  compact?: boolean
}

export async function SellerInfo({ compact = false }: SellerInfoProps) {
  const locale = await getRequestLocale()
  if (compact) {
    return (
      <div className="text-xs text-gray-400 space-y-1">
        <p>{tr({ uk: 'ФОП Кузьменко Владислав Сергійович · Коротич, Харківська обл.', ru: 'ФОП Кузьменко Владислав Сергійович · Коротич, Харківська обл.' }, locale)}</p>
        <p>
          {tr({ uk: 'Оплата після підтвердження замовлення', ru: 'Оплата после подтверждения заказа' }, locale)} ·{' '}
          <Link href={localizedPath(locale, '/delivery')} className="underline hover:text-gray-600">
            {tr({ uk: 'Умови', ru: 'Условия' }, locale)}
          </Link>
        </p>
      </div>
    )
  }

  return (
    <section aria-label={tr({ uk: 'Інформація про продавця', ru: 'Информация о продавце' }, locale)} className="bg-gray-50 border border-gray-100 rounded-2xl p-6 space-y-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{tr({ uk: 'Реквізити продавця', ru: 'Реквизиты продавца' }, locale)}</h3>
      <dl className="space-y-3 text-sm">
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">{tr({ uk: 'Продавець', ru: 'Продавец' }, locale)}</dt>
          <dd className="text-gray-800 font-medium">{tr({ uk: 'ФОП Кузьменко Владислав Сергійович', ru: 'ФОП Кузьменко Владислав Сергійович' }, locale)}</dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">{tr({ uk: 'Місцезнаходження', ru: 'Местонахождение' }, locale)}</dt>
          <dd className="text-gray-800">{tr({ uk: 'Коротич, Харківська область, Україна', ru: 'Коротич, Харьковская область, Украина' }, locale)}</dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">{tr({ uk: 'Оплата', ru: 'Оплата' }, locale)}</dt>
          <dd className="text-gray-800">{tr({ uk: 'Після підтвердження замовлення. Банківський переказ або готівка.', ru: 'После подтверждения заказа. Банковский перевод или наличные.' }, locale)}</dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">IBAN</dt>
          <dd className="text-gray-800 font-mono tracking-wide break-all">UA383220010000026002350058954</dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">{tr({ uk: 'Претензії', ru: 'Претензии' }, locale)}</dt>
          <dd className="text-gray-800">
            {tr({ uk: 'Звертайтеся за контактним номером або через', ru: 'Обращайтесь по контактному номеру или через' }, locale)}{' '}
            <Link href={localizedPath(locale, '/contact')} className="underline hover:text-gray-600">
              {tr({ uk: 'форму зворотного зв’язку', ru: 'форму обратной связи' }, locale)}
            </Link>
            .
          </dd>
        </div>
      </dl>
    </section>
  )
}
