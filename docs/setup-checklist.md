# Дача TV — Setup Checklist

Follow these steps in order before going live. Each section is independent; complete them in parallel if possible.

---

## 1. Sanity CMS

### Create project
1. Go to https://sanity.io → Sign in → New project
2. Project name: `Дача TV`
3. Dataset: `production`
4. Copy **Project ID** from project settings

### Configure env vars
```
NEXT_PUBLIC_SANITY_PROJECT_ID=<your-project-id>
NEXT_PUBLIC_SANITY_DATASET=production
```

### Create API token
1. sanity.io → your project → Settings → API → Tokens
2. Create token: name `Next.js site`, permission `Viewer`
3. Copy token value

```
SANITY_API_TOKEN=<your-token>
```

### Deploy Studio
The Studio is embedded at `/studio` in the site. To use it you first need to
add the Vercel deployment URL as an allowed CORS origin:

1. sanity.io → your project → Settings → API → CORS Origins
2. Add `https://your-vercel-domain.vercel.app` (with credentials = checked)
3. Add `http://localhost:3000` for local development

### Enter initial content
Visit `/studio` on the deployed site (or `http://localhost:3000/studio` locally)
and create the following **before publishing**:

| Document | Fields to fill |
|----------|---------------|
| **Налаштування сайту** (`siteConfig`) | Phone, YouTube URL, Facebook URL, Instagram URL, TikTok URL, Telegram URL, Full address |
| **6 × Мед** (`honeyProduct`) | Name, Slug, Variety, Description, Packaging options, Featured flag, In-stock flag |
| **3 × Продукти пасіки** (`apinaryProduct`) | Name, Slug, Description, Packaging, In-stock |
| **Бджолопакети / вулики** (`beekeeperProduct`) | Name, Slug, Product type, Breeds, Season note |
| **17 × FAQ** (`faqItem`) | Question, Answer, Category — static fallback exists but Sanity entries take precedence |
| **3–4 × Відгуки** (`review`) | Reviewer name, City, Quote, Rating (1–5), Visible = true |
| **Головна сторінка** (`homepageConfig`) | Hero tagline, Hero subtext, Featured product IDs (up to 4) |
| **Доставка** (`deliveryPage`) | Sections with heading + body — static fallback exists |

---

## 2. Supabase

### Create project
1. Go to https://supabase.com → New project
2. Project name: `dacha-tv`
3. Database password: save it somewhere secure
4. Region: choose closest to Ukraine (Frankfurt `eu-central-1`)

### Run migration
Open the **SQL editor** in Supabase dashboard and run:

```sql
CREATE TABLE inquiries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  type            TEXT NOT NULL CHECK (type IN ('honey_order', 'beekeeper_inquiry', 'general')),
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  product         TEXT,
  packaging       TEXT,
  breed           TEXT,
  quantity        TEXT,
  timing          TEXT,
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'contacted', 'completed', 'cancelled')),
  admin_notes     TEXT,
  notified_at     TIMESTAMPTZ
);

CREATE INDEX inquiries_status_created ON inquiries (status, created_at DESC);
```

### Copy credentials
Settings → API:

```
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key — keep secret, server only>
```

> ⚠️ Use the **service_role** key (not the anon key). It is never exposed to the browser.

---

## 3. Telegram Bot (instant mobile notifications)

1. Open Telegram → search **@BotFather** → `/newbot`
2. Bot name: `Дача TV Notifications`
3. Bot username: e.g. `dachatv_notify_bot`
4. Copy the **token** from BotFather

```
TELEGRAM_BOT_TOKEN=<token>
```

5. Start a conversation with the bot (search its username, press Start)
6. Visit `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser
7. Find `"chat":{"id":<NUMBER>}` in the response — that is your chat ID

```
TELEGRAM_CHAT_ID=<number>
```

> For group notifications: add the bot to a group, send a message, then
> call `getUpdates` and look for the group's negative chat ID.

---

## 4. Resend (email backup notifications)

1. Go to https://resend.com → Create account
2. Add domain: Settings → Domains → Add → enter your domain (e.g. `dacha-tv.com`)
3. Add the DNS records shown (SPF, DKIM, DMARC) to your domain registrar
4. Wait for domain verification (usually < 1 hour)
5. Settings → API Keys → Create API key (full access)

```
RESEND_API_KEY=re_<your-key>
OWNER_EMAIL=your@email.com
FROM_EMAIL=notifications@dacha-tv.com
```

6. Update the `from:` field in `lib/notifications/email.ts` to match your verified domain:
   ```ts
   from: 'Дача TV <notifications@dacha-tv.com>',
   ```

> If you don't have a domain yet, use Resend's shared domain `onboarding@resend.dev`
> for initial testing only.

---

## 5. Admin password

Choose a strong password for the `/admin` dashboard:

```
ADMIN_PASSWORD=<your-password>
```

> Never commit this value. Set it only in Vercel environment variables.

---

## 6. Vercel deployment

### Connect repository
1. vercel.com → New Project → Import from GitHub → select `dacha-tv-site`
2. Framework: **Next.js** (auto-detected)
3. Root directory: `/` (default)

### Set all environment variables
In Vercel project → Settings → Environment Variables, add every variable from `.env.local.example`:

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | Sanity project settings |
| `NEXT_PUBLIC_SANITY_DATASET` | `production` |
| `SANITY_API_TOKEN` | Sanity API tokens |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Settings → API (service_role) |
| `RESEND_API_KEY` | Resend API Keys |
| `OWNER_EMAIL` | Your notification email |
| `FROM_EMAIL` | Verified sender email on Resend |
| `TELEGRAM_BOT_TOKEN` | BotFather token |
| `TELEGRAM_CHAT_ID` | From getUpdates API call |
| `ADMIN_PASSWORD` | Your chosen admin password |
| `NEXT_PUBLIC_SITE_URL` | `https://your-domain.vercel.app` or custom domain |
| `NEXT_PUBLIC_GA_MEASUREMENT_ID` | Google Analytics (optional, `G-XXXXXXXXXX`) |

### Add custom domain (optional)
Vercel → your project → Settings → Domains → Add domain

### After first deploy
- Visit `/studio` to confirm Sanity Studio loads
- Submit a test inquiry form and verify:
  - Row appears in Supabase `inquiries` table
  - Telegram notification arrives on your phone
  - Email arrives at `OWNER_EMAIL`
- Visit `/admin`, log in with `ADMIN_PASSWORD`
- Test status toggle on a test inquiry, then delete the test row from Supabase

---

## 7. Google Analytics (optional)

1. analytics.google.com → Create account → Web property
2. Copy Measurement ID (`G-XXXXXXXXXX`)

```
NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

---

## 8. Google Search Console

1. search.google.com/search-console → Add property → Domain
2. Verify via DNS TXT record or HTML file
3. Submit sitemap: `https://your-domain.com/sitemap.xml`
