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
        <p>{tr({ uk: 'ФОП Кузьменко Владислав Сергійович · Коротич, Харківська обл.', ru: 'ФОП Кузьменко Владислав Сергійович · Коротич, Харківська обл.', en: 'Sole proprietor Vladyslav Kuzmenko · Korotych, Kharkiv region' }, locale)}</p>
        <p>
          {tr({ uk: 'Оплата після підтвердження замовлення', ru: 'Оплата после подтверждения заказа', en: 'Payment after order confirmation' }, locale)} ·{' '}
          <Link href={localizedPath(locale, '/delivery')} className="underline hover:text-gray-600">
            {tr({ uk: 'Доставка й оплата', ru: 'Доставка и оплата', en: 'Delivery & payment' }, locale)}
          </Link>{' '}
          ·{' '}
          <Link href={localizedPath(locale, '/returns')} className="underline hover:text-gray-600">
            {tr({ uk: 'Повернення', ru: 'Возврат', en: 'Returns' }, locale)}
          </Link>
        </p>
      </div>
    )
  }

  return (
    <section aria-label={tr({ uk: 'Інформація про продавця', ru: 'Информация о продавце', en: 'Seller information' }, locale)} className="bg-gray-50 border border-gray-100 rounded-2xl p-6 space-y-4">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{tr({ uk: 'Реквізити продавця', ru: 'Реквизиты продавца', en: 'Seller details' }, locale)}</h3>
      <dl className="space-y-3 text-sm">
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">{tr({ uk: 'Продавець', ru: 'Продавец', en: 'Seller' }, locale)}</dt>
          <dd className="text-gray-800 font-medium">{tr({ uk: 'ФОП Кузьменко Владислав Сергійович', ru: 'ФОП Кузьменко Владислав Сергійович', en: 'Sole proprietor Vladyslav Serhiiovych Kuzmenko' }, locale)}</dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">{tr({ uk: 'Місцезнаходження', ru: 'Местонахождение', en: 'Location' }, locale)}</dt>
          <dd className="text-gray-800">{tr({ uk: 'Коротич, Харківська область, Україна', ru: 'Коротич, Харьковская область, Украина', en: 'Korotych, Kharkiv region, Ukraine' }, locale)}</dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">{tr({ uk: 'Оплата', ru: 'Оплата', en: 'Payment' }, locale)}</dt>
          <dd className="text-gray-800">{tr({ uk: 'Після підтвердження замовлення. Банківський переказ або готівка.', ru: 'После подтверждения заказа. Банковский перевод или наличные.', en: 'After order confirmation. Bank transfer or cash.' }, locale)}</dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">IBAN</dt>
          <dd className="text-gray-800 font-mono tracking-wide break-all">UA383220010000026002350058954</dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">{tr({ uk: 'Повернення', ru: 'Возврат', en: 'Returns' }, locale)}</dt>
          <dd className="text-gray-800">
            <Link href={localizedPath(locale, '/returns')} className="underline hover:text-gray-600">
              {tr({ uk: 'Умови повернення, обміну та відшкодування', ru: 'Условия возврата, обмена и возмещения', en: 'Returns, exchanges and refunds policy' }, locale)}
            </Link>
          </dd>
        </div>
        <div className="grid grid-cols-[120px_1fr] gap-x-4">
          <dt className="text-gray-400">{tr({ uk: 'Претензії', ru: 'Претензии', en: 'Claims' }, locale)}</dt>
          <dd className="text-gray-800">
            {tr({ uk: 'Звертайтеся за контактним номером або через', ru: 'Обращайтесь по контактному номеру или через', en: 'Contact us by phone or through the' }, locale)}{' '}
            <Link href={localizedPath(locale, '/contact')} className="underline hover:text-gray-600">
              {tr({ uk: 'форму зворотного зв’язку', ru: 'форму обратной связи', en: 'contact form' }, locale)}
            </Link>
            .
          </dd>
        </div>
      </dl>
    </section>
  )
}
