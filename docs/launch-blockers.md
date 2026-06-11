# Дача TV — Launch Blockers

Last updated: 2026-05-13

---

## Fixed in this pass (code changes)

| # | Issue | File(s) | Status |
|---|-------|---------|--------|
| 1 | `honey-950` color token missing — Hero gradient silently broken | `app/globals.css` | Fixed |
| 2 | Mobile phone number not accessible — removed from header with no replacement | `components/layout/Navigation.tsx` | Fixed — added phone to mobile drawer footer |
| 3 | CTAButton `outline` on dark bg was overridden via hackish `className` prop | `components/shared/CTAButton.tsx`, `app/honey/page.tsx`, `app/products/page.tsx`, `components/home/BeekeeperTeaser.tsx` | Fixed — added `white` variant |
| 4 | ProductCard button used old `rounded-lg` style, inconsistent with new design | `components/products/ProductCard.tsx` | Fixed — changed to `rounded-full` |
| 5 | Home page ProductPreview returns `null` when Sanity has no featured products, leaving the top of the page empty before content is populated | `app/page.tsx` | Fixed — static fallback for 4 honey varieties |
| 6 | All inner page headers used old `bg-honey-50 border-b border-honey-200` band — inconsistent with new white-footer/white-card design | `app/about/page.tsx`, `app/honey/page.tsx`, `app/products/page.tsx`, `app/contact/page.tsx`, `app/delivery/page.tsx`, `app/faq/page.tsx`, `app/beekeeper/page.tsx` | Fixed — unified to `bg-white border-b border-gray-100` with category eyebrow label |

---

## Remaining blockers — require code (no content needed)

None identified. All code-fixable blockers are resolved.

---

## Remaining blockers — require real content/assets from you

These cannot be fixed in code. The site will not fully function without them.

### Critical (must have before launch)

| # | What | Where to add | Notes |
|---|------|-------------|-------|
| C1 | **Real phone number** | Sanity Studio → Налаштування сайту → phone | Placeholder `+380XXXXXXXXX` visible in header, footer, contact page, mobile drawer |
| C2 | **Sanity project ID + API token** | Vercel env vars: `NEXT_PUBLIC_SANITY_PROJECT_ID`, `SANITY_API_TOKEN` | Without these, all CMS queries fail gracefully but show static fallbacks only |
| C3 | **Supabase URL + service role key** | Vercel env vars: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Without these, all inquiry form submissions fail silently |
| C4 | **Admin password** | Vercel env var: `ADMIN_PASSWORD` | `/admin` is inaccessible without it |
| C5 | **At least 1 honey product in Sanity** | Sanity Studio → Мед → New document | Static fallbacks show on home page but link to 404 if slug not in Sanity |
| C6 | **OG social share image** | `/public/images/og/home.jpg` (1200×630px) | Missing — social shares show no image; needs a real branded photo |

### Important (should have before serious promotion)

| # | What | Where to add | Notes |
|---|------|-------------|-------|
| I1 | **Telegram bot token + chat ID** | Vercel env vars: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | Inquiry notifications will only go to email, not Telegram |
| I2 | **Resend API key + email config** | Vercel env vars: `RESEND_API_KEY`, `OWNER_EMAIL`, `FROM_EMAIL` | Email fallback disabled; test with `onboarding@resend.dev` first |
| I3 | **YouTube channel URL** | Sanity Studio → Налаштування сайту → YouTube URL | YouTube section shows dark placeholder; channel link button hidden |
| I4 | **YouTube video ID** | `components/home/YouTubeSection.tsx` → `videoId` prop or `siteConfig.featuredVideoId` | Embed section shows dark placeholder until real video ID added |
| I5 | **Social URLs** (Facebook, Instagram, TikTok, Telegram) | Sanity Studio → Налаштування сайту | Footer social icons hidden; About page icons hidden |
| I6 | **Hero / about / product photos** | See `docs/content-todo.md` for exact specs | All photo slots show gradient placeholders |
| I7 | **3–4 real customer reviews** | Sanity Studio → Відгуки | Reviews section hidden on home page (returns empty) |
| I8 | **Full address** | Sanity Studio → Налаштування сайту → addressFull | Shows fallback text in footer and contact page |

### Nice to have (post-launch)

| # | What | Notes |
|---|------|-------|
| N1 | Google Analytics measurement ID | `NEXT_PUBLIC_GA_MEASUREMENT_ID` — optional, site works without it |
| N2 | Google Search Console verification | Submit `sitemap.xml` after domain is live |
| N3 | Custom domain | Connect in Vercel → Settings → Domains, update `NEXT_PUBLIC_SITE_URL` |
| N4 | Resend domain verification (SPF, DKIM, DMARC) | Required for reliable email delivery; use shared domain for testing |

---

## Launch readiness status

```
Code:     ██████████  100% — build clean, 19 routes, no errors, no broken links
Content:  ████░░░░░░   40% — static fallbacks cover most UX, but critical env vars + real content needed
```

**The site can be deployed to Vercel today** with only static fallback content visible.  
**To accept real orders**, you need at minimum: C1 (phone), C2 (Sanity), C3 (Supabase), C4 (admin password).  
**To look commercially complete**, you additionally need: I1–I8 (notifications, social, photos, reviews).

See `docs/setup-checklist.md` for step-by-step instructions on each service.  
See `docs/content-todo.md` for exact photo specs and Sanity content requirements.
