import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Політика конфіденційності',
  description: 'Політика конфіденційності сайту Дача TV',
  alternates: { canonical: '/privacy' },
  robots: { index: false, follow: false },
}

export default function PrivacyPage() {
  return (
    <div className="bg-cream min-h-screen">
      <div className="bg-honey-50 border-b border-honey-200 py-10 md:py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-bark">
            Політика конфіденційності
          </h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8 text-bark/80 leading-relaxed">

        <section>
          <h2 className="font-serif text-2xl font-bold text-bark mb-4">Загальні положення</h2>
          <p>
            Ця політика конфіденційності описує, які дані збирає сайт Дача TV (далі — &quot;ми&quot;, &quot;сайт&quot;) та як ми їх використовуємо. Використання сайту означає вашу згоду з цією політикою.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-bark mb-4">Які дані ми збираємо</h2>
          <p className="mb-3">
            При заповненні форм замовлення або зворотного зв&apos;язку ми збираємо:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Ім&apos;я</li>
            <li>Номер телефону</li>
            <li>Повідомлення, яке ви залишаєте</li>
            <li>Технічну інформацію (IP-адреса, тип браузера) — для безпеки та запобігання спаму</li>
          </ul>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-bark mb-4">Як ми використовуємо ваші дані</h2>
          <p className="mb-3">Зібрані дані використовуються виключно для:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Обробки вашого замовлення або заявки</li>
            <li>Зв&apos;язку з вами у відповідь на ваш запит</li>
            <li>Покращення роботи сайту</li>
          </ul>
          <p className="mt-3">
            Ми не передаємо ваші персональні дані третім особам без вашої згоди, за винятком випадків, передбачених законодавством України.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-bark mb-4">Cookies та аналітика</h2>
          <p>
            Сайт може використовувати Google Analytics для аналізу трафіку. Ця служба збирає анонімну статистику відвідувань. Ви можете відключити збір даних через налаштування браузера.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-bark mb-4">Зберігання даних</h2>
          <p>
            Дані форм зберігаються в захищеній базі даних та використовуються лише для обробки вашого замовлення. Ми не зберігаємо дані платіжних карток — розрахунок відбувається поза межами нашого сайту.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-bark mb-4">Ваші права</h2>
          <p className="mb-3">Ви маєте право:</p>
          <ul className="list-disc pl-6 space-y-2">
            <li>Дізнатись, які ваші дані ми зберігаємо</li>
            <li>Вимагати видалення ваших даних</li>
            <li>Відкликати свою згоду на обробку даних</li>
          </ul>
          <p className="mt-3">
            Для реалізації цих прав зв&apos;яжіться з нами через{' '}
            <a href="/contact" className="text-honey-700 hover:text-honey-900 underline">
              сторінку контактів
            </a>.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-bark mb-4">Зміни до політики</h2>
          <p>
            Ми можемо оновлювати цю політику. Актуальна версія завжди доступна на цій сторінці. Дата останнього оновлення: 2024 рік.
          </p>
        </section>

        <section>
          <h2 className="font-serif text-2xl font-bold text-bark mb-4">Контакти</h2>
          <p>
            З питань щодо конфіденційності зв&apos;яжіться з нами через{' '}
            <a href="/contact" className="text-honey-700 hover:text-honey-900 underline">
              сторінку контактів
            </a>.
          </p>
        </section>
      </div>
    </div>
  )
}
