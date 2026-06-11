# Дача TV — V1 Implementation Plan

> Planning document. Do not write code until this plan is reviewed and approved.
> Last revised: see git history.

---

## 1. Positioning Statement

**Дача TV** is a Ukrainian family apiary brand from Харківщина, offering real honey and beekeeping products direct from the source — backed by hands-on expertise and a growing content community on YouTube.

**Core message:**
> Справжній мед. Справжня сім'я. Справжня пасіка.
> *(Real honey. Real family. Real apiary.)*

**Positioning pillars:**

| Pillar | What it means |
|---|---|
| Authenticity | Real people, real place, real process — not a reseller |
| Expertise | Beekeepers by practice, educators by content |
| Quality | Premium natural products, honest about what they are |
| Directness | You buy from the people who made it |
| Trust | Content-first brand — you know us before you buy |

**What this brand is NOT:**
- Not a marketplace or aggregator
- Not a generic "eco honey" shop
- Not a village souvenir stall or rustic folk market
- Not a fake luxury brand with stock photos
- Not a cliché yellow-and-black cartoon bee template

---

## 2. Recommended Site Structure

```
/                        → Home (hero, trust, products preview, social proof, CTA)
/honey                   → Honey catalog (all varieties + packaging)
/honey/[slug]            → Individual honey product page
/products                → Other apiary products (pollen, propolis, nuts in honey)
/beekeeper               → Beekeeping products (bee packages, colonies, hives) — inquiry flow
/about                   → Brand story, family, apiary, location
/contact                 → Contact, location, inquiry form
/delivery                → Delivery info, pickup, Ukraine/abroad policy
/faq                     → Common questions about products and ordering
```

**Navigation (primary):**
- Мед
- Продукти
- Пасічникам
- Про нас
- Контакти

**Not in v1 navigation:**
- Blog / content hub (YouTube serves this purpose at launch)
- Gift sets section (can be introduced as Phase 2)
- Any expanded lifestyle / garden category

---

## 3. Page-by-Page Purpose

### `/` — Home
**Purpose:** Convert cold social/YouTube traffic into warm prospects.
- Establish brand immediately — who you are, why trust you, what you sell
- Surface best-selling products with a clear path to inquiry
- YouTube + social proof block builds credibility without requiring clicks away
- One primary CTA above the fold: order honey or get in touch

### `/honey` — Honey Catalog
**Purpose:** Showcase the full range and build purchase intent.
- All 6 varieties displayed with visual differentiation
- Both packaging options visible (1L plastic, 1L glass)
- Акація highlighted as best-seller
- Per-item CTA: "Замовити" — leads to inquiry form, not a cart

### `/honey/[slug]` — Individual Honey Page
**Purpose:** Deep trust-building page for each variety.
- Full description: bloom season, taste profile, texture, crystallisation
- Real photos
- How to order section
- Related products

### `/products` — Other Apiary Products
**Purpose:** Capture buyers of complementary products.
- Pollen, propolis, nuts in honey
- Same inquiry CTA flow as honey

### `/beekeeper` — Beekeeping Products
**Purpose:** Capture beekeepers looking for packages, colonies, hives.
- Peer-to-peer tone — expert to expert, not sales pitch
- No prices shown at launch
- Clear inquiry/call flow for each product type
- Seasonal availability noted (bee packages: spring to autumn)
- Breed options for bee packages (Buckfast, Ukrainian steppe, Carnica)

### `/about` — Brand Story
**Purpose:** The trust anchor. The page people visit before they buy.
- Family story, apiary location referenced naturally (поблизу Харкова)
- Why they started, how long they've been doing it
- Real photos of apiary and people
- YouTube channel reference — "показуємо все відкрито"
- Full location detail (Коротич, Харківська область) is appropriate here

### `/contact` — Contact & Inquiry
**Purpose:** All conversion paths land here if no inline form is used.
- Phone number — large, tappable, primary
- Short inquiry form (name, phone, message)
- Full address appropriate on this page
- Business hours if defined
- Telegram / Viber links

### `/delivery` — Delivery Info
**Purpose:** Remove logistics friction proactively.
- Honey: Nova Poshta / Укрпошта across Ukraine
- International: future availability noted, not promised
- Bee products: self-pickup or individually arranged — no automated shipping

### `/faq` — FAQ
**Purpose:** Handle objections, reduce inbound support questions.
- Product quality, storage, shelf life
- How to order, how to pay
- Delivery questions
- Beekeeping product questions

---

## 4. Conversion Strategy

**Primary conversion goal at launch:** Phone call or inquiry form submission.
No cart, no payment gateway in v1. Goal is qualified lead capture and fast callback.

**Conversion hierarchy:**

```
1. Phone call (top priority — Ukrainian buyers trust a callable brand)
2. Inquiry form submission (honey order or beekeeping inquiry)
3. Telegram / Viber message
4. Email (backup only)
```

**Persistent elements on every page:**
- Phone number visible in header — tappable on mobile
- "Замовити" CTA on every product card
- Floating Telegram contact button on mobile (optional but recommended)

**Trust before conversion:**
The brand story, real apiary photos, and YouTube content do the heavy trust work. Every page should give enough reason to act before asking for it.

**Traffic source alignment:**

| Source | Landing page | Primary CTA |
|---|---|---|
| YouTube description | `/` or `/honey` | "Замовити мед" |
| Instagram bio | `/` | Phone / form |
| Facebook post | Product page | Inquiry |
| Direct search (organic) | SEO-optimized product pages | Relevant product CTA |
| TikTok | `/` | Phone / form |

---

## 5. Catalog vs Inquiry Flow

| Product | Flow | Reasoning |
|---|---|---|
| Honey (all types) | Catalog + order form | Shippable, predictable, standard product |
| Pollen | Catalog + order form | Similar to honey |
| Propolis | Catalog + order form | Similar to honey |
| Nuts in honey | Catalog + order form | Clear SKU, shippable |
| Bee packages | Inquiry / call only | Seasonal, breed selection, live animals |
| Bee colonies | Inquiry / call only | High-value, complex logistics, live animals |
| Empty hives | Inquiry / call only | Type/size selection, no fixed price at launch |
| Hives with bees | Inquiry / call only | Complex, high-touch, live animals |

**No prices shown at launch for any product.**
Prices may be introduced in Phase 2 for honey and standard products only.

**Inquiry flow (beekeeping products):**
1. User reads product page
2. Clicks "Залишити заявку"
3. Short form: name, phone, product interest, approximate quantity/timing
4. Owner receives instant Telegram notification + email
5. Inquiry logged to Supabase
6. Owner calls the buyer back
7. Status updated in inquiry dashboard

---

## 6. Recommended User Flows

### Flow A: Honey buyer from YouTube
```
YouTube video → description link → Home page
→ honey section → clicks "Акація" → product page
→ clicks "Замовити" → order form (name, phone, product, qty)
→ confirmation shown → owner notified instantly → owner calls back
```

### Flow B: Beekeeper looking for bee packages
```
Instagram or search → /beekeeper page
→ reads bee packages + breed info → clicks "Залишити заявку"
→ inquiry form (product type, breed preference, qty, timing)
→ owner notified → contacts by phone
```

### Flow C: Gift buyer via search
```
Search "мед Харківщина купити" or "мед поблизу Харкова" → /honey or home
→ browses honey types → reads delivery info
→ submits order form → owner calls back
```

### Flow D: Returning customer
```
Direct URL / bookmark → home
→ navigates to honey → selects type
→ calls phone directly (always visible) — no form needed
```

---

## 7. MVP Scope for Launch

**Must have at launch:**

- [ ] Home page — hero, products preview, trust block, YouTube section
- [ ] Honey catalog page (all 6 types, both packaging options)
- [ ] Individual honey product pages (minimum: all 6 — can be brief at first)
- [ ] Other products page (pollen, propolis, nuts in honey)
- [ ] Beekeeping products page — inquiry flow only
- [ ] About page
- [ ] Contact page with inquiry form
- [ ] Delivery page
- [ ] FAQ page
- [ ] Order/inquiry forms — lead capture, no payment
- [ ] Phone number in header on every page, tappable on mobile
- [ ] Sanity CMS — for all editable content (products, FAQ, reviews, site config)
- [ ] Supabase — for inquiry/order logging
- [ ] Telegram + email notifications on every form submission
- [ ] Mobile-optimised inquiry dashboard (internal, password-protected)
- [ ] Mobile-first responsive design
- [ ] SEO: title, description, OG tags per page
- [ ] Sitemap.xml
- [ ] Google Analytics 4
- [ ] Privacy policy page
- [ ] 404 page

**Explicitly out of scope for v1:**

- [ ] Online payment / cart / checkout
- [ ] User accounts / login
- [ ] Blog / content hub (link to YouTube instead)
- [ ] Automated shipping / Nova Poshta API
- [ ] Inventory management
- [ ] Price display (any product)
- [ ] International e-commerce infrastructure
- [ ] Multi-language site
- [ ] Review collection automation
- [ ] Expanded product categories beyond core apiary focus

---

## 8. Phase 2 Improvements (Post-Launch)

**Phase 2A — Conversion optimisation (1–3 months):**
- A/B test CTA copy and placement
- Add customer review collection flow (post-delivery SMS/message)
- Google Merchant integration for honey products
- Seasonal availability indicators on product pages (managed in Sanity)

**Phase 2B — Commerce (3–6 months):**
- LiqPay or Monobank Acquiring for honey products
- Simple order cart (honey + other products only — not beekeeping)
- Order tracking via Nova Poshta API
- Email confirmation automation

**Phase 2C — Content and SEO (ongoing):**
- Content/blog section synced with YouTube topics
- Seasonal landing pages (e.g., "Акація 2025")
- Product pages enriched with embedded YouTube links
- FAQ expansion from real customer questions

**Phase 2D — Scale (6–12 months):**
- EU market landing page (translated, separate route)
- European payment methods
- Subscription honey delivery
- Wholesale / B2B inquiry flow

---

## 9. Visual Direction and Design Principles

**The brief in one sentence:**
A modern Ukrainian direct-to-consumer brand that feels premium, natural, and honest — not a village stall, not a fake luxury brand, not a template.

### Color palette direction

| Role | Direction |
|---|---|
| Primary | Warm amber / honey gold — rooted in the product |
| Secondary | Deep forest green — nature, trust, the apiary |
| Background | Warm off-white / cream — not stark clinical white |
| Text | Near-black warm tone — not pure `#000000` |
| Accent | Muted sage or terracotta — secondary calls to action |

Avoid: bright yellow, high-contrast black-and-yellow striping, neon tones, cold greys.

### Typography

- **Headings:** Modern serif or refined semi-serif — conveys authority without stuffiness
- **Body:** Clean, readable sans-serif at comfortable line-height
- **Ukrainian language support** is required for all glyphs — test font rendering in Ukrainian
- No decorative or rustic handwritten fonts

### Photography direction

- Real photos only — no stock imagery, ever
- Apiary and hive shots (outdoor, natural light)
- Honey jars on natural materials (wood, stone, linen — not plastic props)
- Seasonal and process shots: bloom, harvest, extraction, packaging
- People shots if comfortable — builds trust significantly
- Minimum required at launch: all 6 honey varieties photographed, at least 3 apiary shots

### Layout principles

- Full-width hero sections anchored by strong real photography
- Clean grid for product listings — 2-col on mobile, 3-col on desktop
- Generous whitespace — premium feel requires breathing room
- No sidebar layouts
- CTAs: high contrast, clearly labelled, never buried below the fold on mobile
- No auto-playing anything

### What to avoid — explicitly

- Cartoon bees, clipart, yellow-black striped borders or backgrounds
- "50% OFF!!!" fake discount badges
- Decorative honey drip SVGs as primary visual elements
- Dense blocks of body text without visual breaks
- Anything that looks like a free Wix or Squarespace template
- Dark gothic / forest mystique styling
- Excessive use of gold gradients that scream "luxury product"
- Staged studio photography with props that don't match the brand

---

## 10. Trust-Building Elements

Trust is the primary commercial mechanism. Every page should contribute at least one trust signal.

### Primary trust signals (non-negotiable)

1. **Real photos** — apiary, family, products, process. Non-negotiable at launch.
2. **YouTube presence** — existing channel proves credibility. Link or embed prominently.
3. **Location** — "поблизу Харкова / на Харківщині" in public marketing; full address on contact page and in schema.
4. **Product transparency** — honey types named honestly, breeds specified for bee packages
5. **Seasonal honesty** — communicate that stock varies seasonally. This builds not weakens trust.
6. **Phone number always visible** — Ukrainian buyers trust brands they can call
7. **Customer reviews** — real quotes only. Even 3–4 genuine reviews are powerful. Never fabricate.
8. **Process content** — photos or links to YouTube videos of extraction, hive management, packaging

### Secondary trust signals

- Professional, modern design — signals the business is serious
- Fast page load — technical trust
- HTTPS
- Ukrainian language by default
- Delivery policy clearly stated
- Privacy policy in footer

### Trust document handling

At launch or in future iterations, do **not** publish full internal apiary certification documents or veterinary passports publicly.

If credibility documentation is referenced:
- Mention certifications or documentation in written copy only ("наша пасіка проходить регулярний ветеринарний контроль")
- If a document visual is ever used: show a partial/cropped preview with sensitive details redacted or blurred
- Never upload unredacted documents to public-facing assets
- The primary trust mechanism is real content, real photos, and real reviews — not document scans

---

## 11. Content Strategy Integration

**YouTube is the primary content engine.** The website does not compete with it — it converts viewers who already trust the brand.

**Integration approach:**
- Home page: dedicated YouTube section with thumbnail or embed of best video
- About page: 1 embedded video (apiary tour or honey harvest process)
- Product pages: text link to relevant video if one exists — do not embed on every product page
- Do not auto-embed multiple videos (performance and UX cost)
- Always use the **main YouTube channel** — not the secondary channel

**Social ecosystem roles:**

| Platform | Role |
|---|---|
| YouTube (main channel) | Primary trust and content engine — embed + link on site |
| Facebook | Community, reviews — link from site, potential reviews embed |
| Instagram | Visual brand proof — link from site, optional feed block Phase 2 |
| TikTok | Discovery / younger audience — footer icon, link only |

**Website as conversion hub:**
All social platforms should drive traffic back to the website. Every bio, description, and link-in-bio should point to `dacha-tv.com` (or chosen domain).

**Seasonal content calendar (post-launch):**
- Spring: bee packages season open, Акація honey coming
- Summer: main harvest, Сонях, Різнотравʼя
- Autumn: season close, late honey, propolis products
- Winter: gift framing, wholesale inquiries

---

## 12. SEO Foundation Recommendations

**Ukrainian-language SEO is the only priority at launch.**

**Target keyword groups:**

| Group | Keywords |
|---|---|
| Honey buying | купити мед Харків, мед Харківщина, натуральний мед від пасічника |
| Variety-specific | акацієвий мед купити, липовий мед Харків, мед сонях |
| Beekeeper | бджолопакети Харків, продаж бджолопакетів, вулики купити |
| Brand | Дача TV мед, дача тв пасіка |

**On-page SEO baseline:**
- Unique `<title>` and `<meta description>` per page
- Proper heading hierarchy (H1 → H2 → H3, one H1 per page)
- Product pages: `Product` structured data (no price required)
- Home + contact: `LocalBusiness` schema with full address
- FAQ page: `FAQPage` schema
- OG tags on every page
- Sitemap.xml auto-generated by Next.js
- Canonical URLs

**Image SEO:**
- Alt text in Ukrainian, descriptive (not "image1.jpg")
- Consistent file naming: `akatsiya-med-1l-sklo.webp`
- All images served as WebP via Next.js Image component

**Local SEO:**
- Google Business Profile — register for Коротич location
- Consistent NAP (name, address, phone) in footer and schema
- "поблизу Харкова" / "Харківщина" in public copy; full address in schema and contact page only

---

## 13. Admin / Order Handling Recommendations

### At launch — structured but lightweight

**Inquiry intake flow:**
1. Customer submits inquiry or order form
2. Server Action validates and stores inquiry to Supabase (synchronous)
3. Telegram bot sends instant notification to owner's phone
4. Email notification (Resend) sent as backup
5. Owner reviews new inquiry in mobile inquiry dashboard or Telegram
6. Owner calls customer back
7. Status updated in dashboard: `new → contacted → completed / cancelled`
8. Payment: monobank send link or cash

**Inquiry dashboard (v1 internal tool):**
- Password-protected route at `/admin`
- Mobile-optimised — owner uses phone
- Shows: all inquiries in reverse-chronological order
- Per inquiry: name, phone, product, message, timestamp, current status
- Status toggle: new / contacted / completed / cancelled
- Basic filter by status
- No complex CRM features — this is a lightweight operational tool

**Sanity CMS (owner-managed content):**
- Owner can update product descriptions, FAQ answers, contact info from phone
- Sanity Studio works on mobile browser (no app install required)
- No developer needed for routine content updates

**What the owner manages manually at launch:**
- Responding to inquiries by phone
- Booking Nova Poshta shipments
- Payment receipt and confirmation
- Updating product availability in Sanity (mark in-stock / out-of-stock)

---

## 14. Manual vs Automated at Launch

| Function | v1 Approach | Automate when |
|---|---|---|
| Inquiry storage | Supabase — automatic on form submit | From day 1 |
| Owner notification | Telegram bot + email — automatic | From day 1 |
| Inquiry status tracking | Manual update via mobile dashboard | Dashboard replaces this in v1 |
| Product content updates | Sanity CMS — owner does it from phone | From day 1 |
| Order confirmation to buyer | Manual phone call | Volume > 20/week → add SMS auto-reply |
| Payment | Monobank link / cash | Volume > 30/week → integrate LiqPay |
| Shipping booking | Manual Nova Poshta | Volume > 20/week → Nova Poshta API |
| Review collection | Ask customers manually | Phase 2 → auto-request after delivery |
| Inventory display | Boolean flag in Sanity | From day 1 (simple toggle) |
| Analytics | GA4 + Search Console | From day 1 |
| Newsletter | Not at launch | Phase 2 |

---

## 15. Launch Checklist

### Content
- [ ] All product descriptions written in Ukrainian
- [ ] All 6 honey variety descriptions written
- [ ] About page story written and approved
- [ ] Real product photos provided (all honey types at minimum)
- [ ] Real apiary / family photos provided (minimum 3)
- [ ] Delivery and payment terms written and approved
- [ ] FAQ written (minimum 12 questions across categories)
- [ ] Phone number confirmed
- [ ] Social media URLs confirmed (YouTube main channel, Facebook, Instagram, TikTok)
- [ ] Reviews ready (minimum 3 real quotes)

### Technical
- [ ] Domain configured and HTTPS active
- [ ] Sanity project created and content schema deployed
- [ ] All content entered into Sanity
- [ ] Supabase project created and inquiries table migrated
- [ ] Telegram bot created, token and chat ID configured
- [ ] Resend API key configured and email templates tested
- [ ] All forms sending notifications correctly (test end-to-end)
- [ ] Admin dashboard working and tested on mobile
- [ ] All pages rendering correctly on mobile (iOS + Android)
- [ ] GA4 installed and verified
- [ ] Google Search Console verified and sitemap submitted
- [ ] robots.txt configured
- [ ] OG images set for home page and key product pages
- [ ] Page load speed tested (target < 3s on mobile)
- [ ] 404 page exists
- [ ] Privacy policy page live

### Business
- [ ] Google Business Profile created or claimed for Коротич location
- [ ] Website URL added to all social bios
- [ ] YouTube main channel description updated with website link
- [ ] Owner has logged into Sanity Studio from phone and made a test edit
- [ ] Owner has received a test inquiry via Telegram and email
- [ ] Owner has tested the admin dashboard on phone
