import { CTAButton } from '@/components/shared/CTAButton'
import { PhoneLink } from '@/components/shared/PhoneLink'
import { LAUNCH_PHONE } from '@/lib/launch-defaults'
import type { SiteSettings } from '@/types'

interface HowToOrderProps {
  siteSettings: SiteSettings | null
}

const STEPS = [
  {
    number: '01',
    title: 'Оберіть мед або продукт',
    description: 'Перегляньте каталог і оберіть сорт меду або продукт пасіки, який вас цікавить.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
      </svg>
    ),
  },
  {
    number: '02',
    title: 'Залиште заявку або зателефонуйте',
    description: 'Заповніть коротку форму на сайті або зателефонуйте нам напряму — ми відповімо швидко.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 0 1-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
      </svg>
    ),
  },
  {
    number: '03',
    title: 'Отримайте замовлення',
    description: 'Відправимо Новою Поштою або Укрпоштою по всій Україні. Можливий самовивіз.',
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
      </svg>
    ),
  },
]

export function HowToOrder({ siteSettings }: HowToOrderProps) {
  return (
    <section className="py-20 md:py-28 bg-bark" aria-labelledby="how-to-order-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 id="how-to-order-heading" className="font-serif text-3xl md:text-4xl font-bold text-white mb-4">
            Як замовити
          </h2>
          <p className="text-white/50 text-lg">
            Усього три кроки — і мед у вас вдома
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-14">
          {STEPS.map((step, index) => (
            <div key={step.number} className="flex flex-col items-center text-center">
              {/* Circular icon container */}
              <div className="w-20 h-20 rounded-full bg-white/8 border-2 border-white/15 flex items-center justify-center text-honey-300 mb-6">
                {step.icon}
              </div>

              {/* Step number */}
              <span className="text-xs font-semibold text-honey-600 uppercase tracking-widest mb-3">
                Крок {index + 1}
              </span>

              <h3 className="font-serif text-xl font-semibold text-white mb-3">
                {step.title}
              </h3>
              <p className="text-white/50 leading-relaxed">
                {step.description}
              </p>
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <CTAButton href="/honey" size="lg" variant="primary">
            Перейти до каталогу
          </CTAButton>

          <PhoneLink
            phone={siteSettings?.phone || LAUNCH_PHONE}
            showIcon
            className="text-xl font-bold text-honey-300 hover:text-honey-200 transition-colors"
          />
        </div>
      </div>
    </section>
  )
}
