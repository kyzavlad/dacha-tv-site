import { TrackedPhoneLink } from '@/components/shared/TrackedPhoneLink'

const parts: Record<string, { models: string; uk: string; ru: string; en: string }> = {
  'N-290832': { models: 'Honda DIO AF35 / AF48 / AF51 / AF56', uk: 'Задній варіатор, алюміній, VDK.', ru: 'Задний вариатор, алюминий, VDK.', en: 'Rear variator, aluminium, VDK.' },
  'N-297981': { models: 'Honda DIO JF31', uk: 'Фара в зборі, VV-2.', ru: 'Фара в сборе, VV-2.', en: 'Headlight assembly, VV-2.' },
  'N-297240': { models: 'Honda DIO JF31', uk: 'Пластик: передній і бічні бампери, VV.', ru: 'Пластик: передний и боковые бамперы, VV.', en: 'Body plastics: front and side bumpers, VV.' },
}

// Exact supplier-SKU notes only. Model names are from the supplier listing;
// they are not a verified fit guarantee for every year/trim.
export function ProductFitmentNote({ sku, locale }: { sku: string | null | undefined; locale: string }) {
  const part = sku ? parts[sku] : undefined
  if (!part) return null
  const lang = locale === 'ru' ? 'ru' : locale === 'en' ? 'en' : 'uk'
  const words = {
    uk: { heading: 'Перед замовленням', sku: 'Артикул', models: 'Моделі в описі постачальника', check: 'Звірте маркування скутера, форму деталі та кріплення зі старою запчастиною. Назва моделі сама по собі не підтверджує сумісність.', help: 'Не впевнені у виборі? Назвіть артикул, коли телефонуєте.' },
    ru: { heading: 'Перед заказом', sku: 'Артикул', models: 'Модели в описании поставщика', check: 'Сверьте маркировку скутера, форму детали и крепления со старой запчастью. Название модели само по себе не подтверждает совместимость.', help: 'Не уверены в выборе? Назовите артикул при звонке.' },
    en: { heading: 'Before you order', sku: 'SKU', models: 'Models named by the supplier', check: 'Compare your scooter identification, the part shape and mounting points with the original part. A model name alone does not confirm fitment.', help: 'Need help choosing? Quote the SKU when you call.' },
  }[lang]
  return (
    <section aria-label={words.heading} className="mb-6 rounded-xl border border-honey-200 bg-white p-4 text-sm">
      <h2 className="font-semibold text-bark">{words.heading}</h2>
      <p className="mt-2 text-bark/80">{part[lang]}</p>
      <dl className="mt-3 space-y-2">
        <div><dt className="text-xs text-bark/60">{words.sku}</dt><dd className="font-mono font-medium text-bark">{sku}</dd></div>
        <div><dt className="text-xs text-bark/60">{words.models}</dt><dd className="text-bark">{part.models}</dd></div>
      </dl>
      <p className="mt-3 leading-relaxed text-bark/70">{words.check}</p>
      <p className="mt-3 text-bark/70">{words.help}</p>
      <TrackedPhoneLink phone="+380951444853" location="product-fitment" className="mt-1 inline-flex min-h-11 items-center font-semibold text-honey-700 underline underline-offset-4">+380 95 144 48 53</TrackedPhoneLink>
    </section>
  )
}
