# Vercel Environment Variables Checklist

Цей документ описує всі змінні середовища, необхідні для роботи сайту Дача TV на Vercel.

---

## Обов'язкові змінні (без них сайт не працює)

### Supabase (контент + форми замовлення)

| Змінна | Де взяти | Приклад |
|--------|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | supabase.com → Project → Settings → API | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | supabase.com → Project → Settings → API → anon public | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | supabase.com → Project → Settings → API → service_role | `eyJ...` |

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` — НІКОЛИ не використовуйте з префіксом `NEXT_PUBLIC_`. Це ключ з повним доступом до бази даних.

### Адміністративна панель

| Змінна | Що вводити |
|--------|-----------|
| `ADMIN_PASSWORD` | Придумайте надійний пароль (мінімум 16 символів, букви+цифри+символи). Наприклад: `Dacha!TV_2025@Honey` |

---

## Додаткові змінні (для сповіщень)

### Telegram (для отримання замовлень у Telegram)

| Змінна | Де взяти |
|--------|----------|
| `TELEGRAM_BOT_TOKEN` | BotFather у Telegram → /newbot → скопіюйте токен |
| `TELEGRAM_CHAT_ID` | Надішліть боту будь-яке повідомлення → перевірте `https://api.telegram.org/bot<TOKEN>/getUpdates` → знайдіть `chat.id` |

### Resend (для Email-сповіщень)

| Змінна | Де взяти |
|--------|----------|
| `RESEND_API_KEY` | resend.com → API Keys → Create API Key |
| `RESEND_FROM_EMAIL` | Ваша підтверджена адреса в Resend. Наприклад: `noreply@dachatv.ua` |
| `RESEND_TO_EMAIL` | Куди надсилати листи. Наприклад: `orders@dachatv.ua` |

---

## Як встановити змінні у Vercel

1. Відкрийте vercel.com → ваш проект → **Settings** → **Environment Variables**
2. Для кожної змінної:
   - Name: точна назва зі списку вище
   - Value: значення
   - Environment: оберіть **Production** та **Preview**
3. Натисніть **Save**
4. Після додавання всіх змінних — **Redeploy** (Deployments → три крапки → Redeploy)

---

## Перевірка після встановлення

| Перевірка | Ознака успіху |
|-----------|--------------|
| Supabase підключений | `/honey` показує продукти (або порожній каталог до внесення контенту) |
| Admin panel | `/admin` запитує пароль, вхід з `ADMIN_PASSWORD` працює |
| Форми | Форма замовлення відправляється без помилки |
| Telegram | Тестове замовлення → повідомлення у Telegram |
| Resend | Тестове замовлення → лист на `RESEND_TO_EMAIL` |

---

## Змінні за середовищами

| Змінна | Production | Preview | Development |
|--------|-----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | ✅ (в .env.local) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | ✅ (в .env.local) |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | ✅ | ✅ (в .env.local) |
| `ADMIN_PASSWORD` | ✅ | ✅ | ✅ (в .env.local) |
| `TELEGRAM_BOT_TOKEN` | ✅ | необов'язково | необов'язково |
| `RESEND_API_KEY` | ✅ | необов'язково | необов'язково |

---

## Локальна розробка (.env.local)

Створіть файл `.env.local` у корені проекту (він вже в `.gitignore`):

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ваш_anon_key
SUPABASE_SERVICE_ROLE_KEY=ваш_service_role_key

ADMIN_PASSWORD=ваш_пароль
```
