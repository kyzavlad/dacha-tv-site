# Дача TV — Content & Assets TODO

Everything here must be provided by you (the owner) before the site goes live.
Placeholders are currently shown in their place.

---

## PHOTOS (highest priority)

All photo slots currently show amber/green gradient placeholders.

| Location | What's needed | Size / format |
|----------|---------------|---------------|
| Hero (home page background) | Apiary wide shot — hives in a field or garden, warm light | 1920×1080px min, JPG/WebP |
| Brand Story section (home) | You working with the hives — natural, not posed | 800×600px min, 4:3 ratio |
| About page story section | Apiary or family at work — wide, landscape | 1200×675px (16:9) |
| Each honey product in Sanity | Jar of the specific honey variety, clean background | 800×800px min, square |
| Each apiary product in Sanity | Jar/pack of pollen, propolis, nuts — similar style | 800×800px min, square |
| Each beekeeper product in Sanity | Bees, package, hive — representative photo | 800×600px min |
| OG image (`/public/images/og/home.jpg`) | Branded social share image — honey jar + apiary text | 1200×630px exactly |

**Photography notes (from build-rules.md):**
- Real photos only — no stock imagery
- No fake-rustic filters; natural, modern look
- Show real work, real jars, real hives
- Warm natural light preferred

---

## VIDEOS

| Location | What's needed |
|----------|---------------|
| Home page YouTube section | One real Дача TV YouTube video ID (e.g. `abc123XYZ`) |
| About page YouTube section | Same video or a different apiary video |

**How to add:** Once you have a real video, add it to Sanity Studio:
- `siteConfig` → add a `featuredVideoId` field (requires adding the field to the schema first, or just hardcode in `YouTubeSection.tsx`)
- Or simply edit `components/home/YouTubeSection.tsx` and pass the real video ID

---

## SANITY CMS CONTENT

Enter all of this through Sanity Studio at `/studio` after deployment.

### Site Config (one document)
- [ ] Phone number (format: `+380XXXXXXXXX`)
- [ ] YouTube channel URL
- [ ] Facebook page URL (if applicable)
- [ ] Instagram profile URL (if applicable)
- [ ] TikTok profile URL (if applicable)
- [ ] Telegram link (channel or contact)
- [ ] Full address: `Коротич, Пісочинська ОТГ, Харківська область, Україна`

### Honey Products (6 documents)
For each variety: Акація, Липа, Сонях, Різнотрав'я, Сади, Ліс

- [ ] Name (Ukrainian)
- [ ] Slug (auto-generated from name)
- [ ] Variety name (for card notes)
- [ ] Description (rich text, 2–4 paragraphs)
- [ ] Packaging options (e.g. `1L пластик`, `1L скло`)
- [ ] Featured flag (mark 3–4 for home page)
- [ ] In-stock flag
- [ ] Photo (see Photos table above)

### Apiary Products (3 documents)
Квітковий пилок, Прополіс, Горіхи в меду

- [ ] Name, Slug
- [ ] Description
- [ ] Packaging
- [ ] In-stock flag
- [ ] Photo

### Beekeeper Products (3–6 documents)
Bee packages (Buckfast, Українська степова, Карніка), bee colonies, hives

- [ ] Name, Slug
- [ ] Product type (bee_packages / bee_colonies / empty_hives / hives_with_bees)
- [ ] Available breeds (for packages)
- [ ] Season note
- [ ] Description
- [ ] Photo (optional)

### Reviews (minimum 3–4 before the section shows)
- [ ] Reviewer name (first name + city is enough)
- [ ] City
- [ ] Quote (real customer words, not invented)
- [ ] Rating (1–5 stars)
- [ ] Set Visible = true

### Homepage Config (one document)
- [ ] Hero tagline (or leave blank to use default)
- [ ] Hero subtext (or leave blank to use default)
- [ ] Featured product IDs — pick 3–4 honey products to show on home page

### Delivery Page (one document)
Static fallback content exists; update only if you want to change the delivery terms.
- [ ] Review the static fallback sections in `app/delivery/page.tsx`
- [ ] Override in Sanity if needed

### FAQ
Static fallback of 17 questions exists (already covers main topics).
- [ ] Review the static FAQ in `app/faq/page.tsx`
- [ ] Add/edit in Sanity to replace or supplement

---

## COPY REVIEW

These text blocks are coded directly in the site. Review them before going live:

| File | Section | Review |
|------|---------|--------|
| `components/home/Hero.tsx` | Default tagline and subtext | Override via `homepageConfig` in Sanity |
| `components/home/BrandStory.tsx` | 3 paragraphs about the apiary | Hardcoded — edit the file if needed |
| `app/about/page.tsx` | Story, apiary details, approach text | Hardcoded — edit if needed |
| `app/privacy/page.tsx` | Full privacy policy | Review for accuracy |
| `app/delivery/page.tsx` | Delivery + payment terms | Review for accuracy; override in Sanity |

---

## DOMAIN

- [ ] Purchase domain (suggested: `dacha-tv.com.ua` or `dacha-tv.com`)
- [ ] Connect to Vercel in project Settings → Domains
- [ ] Update `NEXT_PUBLIC_SITE_URL` env var to the real domain
- [ ] Update CORS origins in Sanity project settings

---

## EMAIL SENDER DOMAIN

For Resend notifications to arrive reliably (not in spam):
- [ ] Verify your domain in Resend dashboard
- [ ] Add DNS records (SPF, DKIM, DMARC) at your registrar
- [ ] Update `from:` in `lib/notifications/email.ts` to your domain

---

## AFTER LAUNCH

- [ ] Test the full order flow: submit form → check Telegram → check email → check Supabase → mark as contacted in /admin
- [ ] Verify OG image shows correctly when sharing on Facebook/Telegram
- [ ] Submit sitemap to Google Search Console
- [ ] Check mobile layout on an actual phone (not just browser devtools)
