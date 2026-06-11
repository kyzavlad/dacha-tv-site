# Дача TV — Technical Architecture

> Planning document. No code should be written until this plan is reviewed and approved.
> Last revised: see git history.

---

## 1. Recommended Stack for Fast Launch

Every choice is justified by a real v1 requirement. Nothing is added speculatively.

### Core Stack

| Layer | Technology | Justification |
|---|---|---|
| Framework | **Next.js 14+** (App Router) | SSR/SSG for SEO, React ecosystem, Vercel-native deployment |
| Language | **TypeScript** | Type safety, better DX, catches schema mismatches early |
| Styling | **Tailwind CSS** | Consistent design tokens, no CSS bloat, fast to build |
| Component base | **shadcn/ui** (selected components only) | Accessible, unstyled-by-default, no vendor lock-in |
| Package manager | **pnpm** | Faster, disk-efficient |

### Content Layer — Sanity CMS (from day one)

Product data, homepage sections, FAQ, reviews, contact info, and delivery text are all managed in **Sanity CMS** from day one. This is a hard requirement because:

- The owners must be able to update content from a phone without a developer
- Product availability changes seasonally
- FAQ and review content needs to be editable independently
- Static TypeScript files create a developer bottleneck for routine changes

**What lives in Sanity:**

| Content type | Schema name | Editable fields |
|---|---|---|
| Honey product | `honeyProduct` | name, slug, description, variety, packaging, isFeatured, inStock, image, youtubeLink |
| Other product | `apinaryProduct` | name, slug, description, packaging, inStock, image |
| Beekeeper product | `beekeeperProduct` | name, slug, description, breeds[], seasonal note, image |
| FAQ item | `faqItem` | question, answer, category |
| Customer review | `review` | name, city, quote, rating, isVisible |
| Homepage section | `homepageConfig` | featuredProducts[], heroTagline, heroSubtext |
| Site config | `siteConfig` | phone, telegramLink, youtubeUrl, facebookUrl, instagramUrl, tiktokUrl, address |
| Delivery/payment text | `deliveryPage` | sections with rich text |

**Sanity Studio:**
- Hosted at `studio.dacha-tv.com` (or Sanity's managed URL)
- Works in mobile browser — no app install required
- Owner manages all content independently

**Data fetching in Next.js:**
- Use Sanity's `@sanity/client` with GROQ queries
- Product pages use `generateStaticParams` + ISR (revalidate: 60s) — fast and editable
- Homepage and FAQ use ISR — changes in Sanity appear within ~1 minute without redeployment
- No static TypeScript product files in the source code

### Inquiry and Data Layer — Supabase

All inquiry form submissions are stored in **Supabase** (managed Postgres).

**Why Supabase:**
- Managed Postgres with a generous free tier
- Built-in REST API and TypeScript client
- Simple enough for this scale, robust enough to grow with
- Owner can inspect data via Supabase dashboard if needed
- The same database powers the v1 internal inquiry dashboard

**Why not Neon/Vercel Postgres:**
- Supabase provides Row Level Security (RLS) for protecting admin routes natively
- Better long-term fit if CRM features are added later

### Notification Layer

Every form submission triggers **both** notifications in parallel:

| Channel | Tool | Reason |
|---|---|---|
| Telegram | Telegram Bot API | Instant mobile notification — primary for Ukrainian business owners |
| Email | Resend | Reliable backup, readable on any device, archivable |

Telegram is not optional. It is the primary real-time notification mechanism and must work from day one.

### Analytics

| Tool | Purpose | Cost |
|---|---|---|
| Google Analytics 4 | Traffic, conversions, source attribution | Free |
| Google Search Console | SEO, keyword tracking, indexing | Free |
| Vercel Analytics | Core Web Vitals, performance monitoring | Free tier |

---

## 2. CMS / Admin Architecture

### Sanity CMS — content management

**Schema design principles:**
- Keep schemas simple — only fields that are actually edited
- `inStock` boolean on all products — owner toggles availability from phone
- `isVisible` / `isFeatured` fields for surfacing seasonal products
- All text fields support Ukrainian characters natively
- Images stored in Sanity CDN with automatic WebP delivery

**Sanity free tier limits (as of planning):**
- 3 users, 10GB assets, 500k API CDN requests/month
- Sufficient for v1 volume with room to spare
- Upgrade path is straightforward if needed

**Owner workflow for content changes:**
1. Opens Sanity Studio in mobile browser
2. Navigates to product / FAQ / review
3. Makes edit or toggles availability
4. Publishes — change appears on site within ~60 seconds (ISR)

No developer involved for routine content updates.

### Internal Inquiry Dashboard — mobile-first admin

A lightweight password-protected route at `/admin` within the Next.js app.

**Purpose:** Allow the owner to review and track inquiry status from a phone.

**This is not a complex CRM. It is a simple operational tool.**

**Features:**
- List of all inquiries (reverse-chronological)
- Per inquiry: name, phone (tap-to-call), product interest, message, timestamp, status badge
- Status toggle: `нова → зателефонований → виконано / скасовано`
- Filter by status (new / contacted / completed)
- Bulk view of "нові" inquiries at the top
- Simple search by name or phone

**Authentication:**
- Single password (environment variable) — no user accounts needed
- HTTP-only cookie session — secure, no JWT complexity
- If the site outgrows this, migrate to Supabase Auth (one user account)

**Mobile design requirements:**
- Large tap targets (min 44px)
- Status toggle as swipeable card or large button — not a tiny dropdown
- Phone number is a `tel:` link — tap to call directly from the dashboard
- No horizontal scrolling on mobile

**Technical approach:**
- Next.js App Router with a `/admin` route group
- Reads directly from Supabase inquiries table
- Status updates via Server Actions
- No external admin framework — purpose-built in ~150–200 lines

---

## 3. Form Handling

### Honey / Apiary Product Order Form

**Fields:**
```
name          string, required
phone         string, required — Ukrainian format validation (+380 or 0XX)
product       select — populated from Sanity honey + product catalog
packaging     select — populated based on product selection
quantity      number, optional
message       text, optional, max 500 chars
_honeypot     hidden — bot filter
```

**Submission flow:**
1. Client validates with React Hook Form + Zod (immediate feedback)
2. Server Action receives validated data
3. `INSERT` to Supabase `inquiries` table (synchronous — failure blocks success response)
4. Fire Telegram notification (async — does not block response)
5. Fire Resend email to owner (async — does not block response)
6. Return success → show confirmation message to user
7. If Supabase insert fails → return error → user sees "спробуйте ще раз"

**Rate limiting:**
- Max 3 submissions per IP per hour (Next.js middleware or Upstash Redis if needed)
- Honeypot field blocks simple bots

### Beekeeping Inquiry Form

**Fields:**
```
name          string, required
phone         string, required
product_type  select — Бджолопакети / Бджолосімʼї / Порожній вулик / Вулик з бджолами
breed         select — shown only when product_type = Бджолопакети
              (Buckfast / Українська степова / Карніка / Не визначився)
quantity      string, optional — free text ("2–3 пакети", etc.)
timing        string, optional — ("навесні", "якомога швидше", etc.)
message       text, optional
_honeypot     hidden
```

Same notification and storage flow as honey form.

### Notification Templates

**Telegram message format:**
```
🆕 Нова заявка — [type]

Ім'я: [name]
Телефон: [phone] (tap-to-call in Telegram)
Продукт: [product]
Кількість: [quantity]
Повідомлення: [message]
Час: [timestamp]
```

**Owner email (Resend):**
- Subject: `Нова заявка від [name] — Дача TV`
- Reply-to: not applicable (owner calls back)
- Body: all fields in readable format
- Link to admin dashboard

**Customer confirmation message:**
- Shown on-screen immediately after form submission
- Text: "Дякуємо! Ми зв'яжемося з вами найближчим часом."
- Optional: send a Resend confirmation email to customer if email field is added (Phase 2)

---

## 4. Database Schema

### Supabase — Inquiries

```sql
CREATE TABLE inquiries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  type            TEXT NOT NULL CHECK (type IN ('honey_order', 'beekeeper_inquiry', 'general')),
  name            TEXT NOT NULL,
  phone           TEXT NOT NULL,
  product         TEXT,
  packaging       TEXT,
  breed           TEXT,           -- bee packages only
  quantity        TEXT,
  timing          TEXT,           -- beekeeping inquiries
  message         TEXT,
  status          TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'contacted', 'completed', 'cancelled')),
  admin_notes     TEXT,           -- internal notes from owner
  notified_at     TIMESTAMPTZ     -- when Telegram notification was sent
);

-- Index for admin dashboard default view
CREATE INDEX inquiries_status_created ON inquiries (status, created_at DESC);
```

**Row Level Security:**
- Table is not publicly readable
- Server-side operations (Server Actions) use the service role key
- The service role key is only in environment variables — never exposed to client

### Sanity — Schema overview (GROQ/TypeScript types)

Content schemas are defined in the Sanity Studio config. Key types:

```typescript
// honeyProduct
{
  _id: string
  _type: 'honeyProduct'
  name: string                  // "Акацієвий мед"
  slug: { current: string }
  variety: string               // "Акація"
  description: PortableText
  packaging: string[]           // ['1L пластик', '1L скло']
  isFeatured: boolean
  inStock: boolean
  image: SanityImageAsset
  youtubeVideoLink?: string
}

// siteConfig (singleton)
{
  _type: 'siteConfig'
  phone: string
  telegramUrl: string
  youtubeUrl: string            // main channel only
  facebookUrl: string
  instagramUrl: string
  tiktokUrl: string
  addressDisplay: string        // "Коротич, Харківська область"
  addressFull: string           // "Коротич, Пісочинська ОТГ, Харківська область"
}
```

---

## 5. What to Build Now vs Defer

### Build now (v1 — required at launch):

| Feature | Justification |
|---|---|
| All public pages (home, honey, products, beekeeper, about, contact, delivery, faq) | Core commercial need |
| All honey product pages (6 varieties) | Primary revenue driver |
| Sanity CMS with all schemas | Owner must manage content from phone — day one |
| Supabase inquiries table | Lead storage — no inquiry should be lost |
| Honey order form + beekeeping inquiry form | Primary conversion mechanism |
| Telegram bot notifications | Real-time lead alerts to owner's phone |
| Resend email notifications | Backup and audit trail |
| Mobile-first inquiry dashboard `/admin` | Owner must be able to manage inquiries from phone |
| Mobile-optimised design throughout | Majority of social traffic is mobile |
| SEO: metadata, OG tags, structured data | Indexable from day 1 |
| Sitemap.xml | Crawlable from day 1 |
| GA4 + Search Console | Measure from day 1 |
| 404 page | Basic site quality |
| Privacy policy page | Legal minimum |

### Defer to Phase 2+:

| Feature | Why defer |
|---|---|
| Shopping cart / checkout | Volume doesn't justify the complexity yet |
| Payment gateway (LiqPay, Monobank) | Manual bank transfer works at v1 volume |
| User accounts / login | No use case |
| Blog / content section | YouTube fills this role at launch |
| Nova Poshta API | Manual booking works at v1 volume |
| Inventory levels / stock counts | Boolean inStock toggle in Sanity is sufficient |
| Email confirmation to buyer | On-screen confirmation + phone callback is sufficient at launch |
| Instagram feed embed | Performance cost — defer until Phase 2 |
| Google Reviews widget | Not enough reviews at launch to justify |
| Multi-language | Ukraine-first at launch |
| International e-commerce | Mention only — no infrastructure |
| Expanded product categories | Keep v1 tightly scoped |

---

## 6. Deployment Notes

### Hosting: Vercel

**Why:**
- Native Next.js deployment — zero config
- Free tier handles v1 traffic
- Automatic HTTPS
- EU CDN edge nodes — acceptable latency for Ukraine
- Preview deployments per branch — review before merging
- Simple environment variable management

### Environment Variables

```
# Content
NEXT_PUBLIC_SANITY_PROJECT_ID
NEXT_PUBLIC_SANITY_DATASET
SANITY_API_TOKEN                # Read token for ISR fetching

# Database
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY       # Server-side only — never exposed to client

# Notifications
RESEND_API_KEY
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID                # Owner's personal chat ID or group

# Admin
ADMIN_PASSWORD                  # Single password for /admin route

# Analytics
NEXT_PUBLIC_GA_MEASUREMENT_ID
```

### Domain

- `.ua` or `.com.ua` preferred for Ukrainian SEO (register via Hostpro or NIC.UA)
- `.com` as fallback if international expansion is the priority
- Point DNS to Vercel — automatic SSL provisioning

### Deployment Workflow

```
feature/* branch
    → git push
    → Vercel preview deployment (test URL)
    → review and approve
    → merge to main
    → Vercel production deployment (automatic)
```

Content changes in Sanity do not require a deployment — ISR handles revalidation automatically.

### Branch Strategy

```
main        → Production
staging     → Pre-production review (optional)
feature/*   → Feature development
```

---

## 7. SEO / Metadata / Image Handling

### Metadata (Next.js 14 Metadata API)

Each page exports a `generateMetadata` function. Product pages generate metadata from Sanity data.

**Required per page:**
- Unique `<title>` including brand name: `Акацієвий мед | Дача TV`
- `<meta description>` 150–160 chars, Ukrainian, includes natural keywords
- Open Graph: title, description, image (1200×630), locale `uk_UA`
- Canonical URL

**Example — honey product page:**
```typescript
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const product = await getHoneyProduct(params.slug)
  return {
    title: `${product.name} | Дача TV`,
    description: `Натуральний ${product.name.toLowerCase()} від сімейної пасіки на Харківщині. ${product.packaging.join(', ')}.`,
    openGraph: {
      images: [{ url: urlFor(product.image).width(1200).height(630).url() }],
      locale: 'uk_UA',
    },
  }
}
```

### Structured Data (JSON-LD)

| Page | Schema |
|---|---|
| Home | `Organization` + `LocalBusiness` |
| Honey product pages | `Product` (no price field required) |
| About / Contact | `LocalBusiness` with full address |
| FAQ | `FAQPage` |

**LocalBusiness schema uses the full address** (Коротич, Пісочинська ОТГ, Харківська область) — this is appropriate and expected in structured data regardless of what the visible copy shows.

### Image Handling

**All images rendered via Next.js `<Image>` component:**
- Automatic WebP conversion
- Lazy loading (except hero — use `priority` prop)
- Responsive srcsets
- CLS prevention via explicit `width` and `height`

**Sanity image handling:**
- Product photos stored in Sanity CDN
- Use `@sanity/image-url` with explicit dimensions for consistent output
- Alt text stored as a field in Sanity — owner sets it when uploading

**Static image organisation (for non-Sanity images — OG, icons, etc.):**
```
/public
  /images
    /og/        ← OG images 1200×630 (home, about, key products)
    /icons/     ← Favicon, apple touch icon
```

**Performance targets:**
- LCP < 2.5s on mobile
- Hero image: `priority` prop + explicit dimensions
- Lighthouse mobile score: 90+
- No unoptimised images (`unoptimized` prop forbidden)

---

## 8. Future Automation Opportunities

Prioritised by commercial impact.

### Implement when volume triggers it:

**1. Nova Poshta API integration**
- Auto-calculate delivery cost by recipient city
- Generate waybill from admin dashboard
- Trigger: 20+ honey orders/week

**2. Payment link generation (Monobank / LiqPay)**
- After inquiry confirmed → generate and send payment link to customer
- Webhook on payment → update inquiry status automatically
- Trigger: 30+ orders/week or customer demand

**3. Automated customer SMS on form submission**
- "Дякуємо, зателефонуємо найближчим часом" via TurboSMS or AlphaSMS
- Trigger: volume or customer experience improvement priority

**4. Post-delivery review request**
- After inquiry status set to `completed` → send SMS or Telegram with Google review link
- Very high ROI for trust-building
- Trigger: Phase 2 whenever delivery tracking exists

### Medium-term (Phase 2C+):

**5. Email marketing — Brevo / Mailchimp**
- Opt-in email at order time
- Seasonal campaigns: "Акація сезон відкрито", "Нова партія меду"

**6. Inventory sync beyond boolean**
- Track stock quantities in Supabase
- Show "залишилось X банок" on product page (urgency without false scarcity)

**7. Sanity webhook → revalidate specific page**
- Currently: ISR revalidates every 60s
- Improvement: Sanity `onPublish` webhook triggers immediate page revalidation
- Implementation: a single Vercel API route receiving Sanity webhook

### Long-term (Phase 3):

**8. EU infrastructure**
- Next.js i18n for EN/DE routes
- Stripe or Mollie for European payments
- Full GDPR compliance layer

**9. Subscription honey delivery**
- Recurring orders for returning customers
- Requires Stripe Billing or similar

---

## Summary: V1 Technology Footprint

```
Next.js 14+ (App Router)
TypeScript
Tailwind CSS
shadcn/ui (selected components)
React Hook Form + Zod

Sanity CMS                    ← Content management (owner-editable from phone)
Supabase (Postgres)           ← Inquiry storage + admin dashboard data
Resend                        ← Email notifications
Telegram Bot API              ← Real-time mobile notifications

Vercel                        ← Hosting + deployment
Google Analytics 4            ← Traffic and conversion tracking
Google Search Console         ← SEO monitoring
Vercel Analytics              ← Performance monitoring
```

**Third-party services: 8**
**Monthly cost at v1 scale: $0 (all free tiers)**
**Developer dependencies for routine content updates: 0**
**Time to deploy v1: 2–3 weeks of focused development**
