# Дача TV — Content Map

> Defines all content blocks, messaging hierarchy, and page-level content requirements.
> Planning document. No code or components should be created yet.
> Last revised: see git history.

---

## Location Language Policy

Before reading the content blocks, note the location language policy that applies across the entire site:

| Context | Language to use |
|---|---|
| Hero tagline / marketing headlines | "на Харківщині" or "поблизу Харкова" |
| Product page descriptions | "Харківська область" — acceptable if natural |
| About page (trust anchor) | "Коротич, Харківська область" — appropriate detail |
| Contact page | Full: "Коротич, Пісочинська ОТГ, Харківська область" |
| Footer | Full address |
| Structured data / schema | Full address |
| Internal tool (admin) | Whatever is accurate |

**Do not** repeat "Пісочинська ОТГ" in hero text, product cards, or repeated marketing copy blocks. This level of administrative detail adds friction in public-facing copy without adding trust value.

---

## 1. Home Page Content Blocks

The home page is the primary landing destination for YouTube and social traffic. Every block has a defined job. No decorative filler.

---

### Block 1: Hero
**Job:** Establish the brand immediately. Make the visitor feel they've arrived at the right place.

**Content elements:**
- Background: full-width real apiary or honey photo (not stock, not studio)
- Brand name: **Дача TV**
- Tagline: `Справжній мед. Від нашої пасіки — до вашого столу.`
- Subtext (1 sentence, soft location): `Сімейна пасіка на Харківщині. Мед, пилок, прополіс та бджолині пакети.`
- Primary CTA: `Обрати мед` → /honey
- Secondary CTA (text link): `Дізнатись про нас` → /about

**Notes:**
- Photo quality in this block is the single most important visual decision on the site.
- On mobile, tagline must remain legible — dark overlay or text shadow if needed.
- Do not mention "Пісочинська ОТГ" here. "на Харківщині" is sufficient and more readable.

---

### Block 2: Product Preview / Best Sellers
**Job:** Get the product in front of the visitor immediately. Reduce steps to purchase intent.

**Content elements:**
- Section heading: `Наш мед`
- 3–4 product cards:
  - Акація — best-seller, featured most prominently
  - Липа — seasonal classic
  - Різнотравʼя or Сонях — third card
  - Горіхи в меду or Пилок — fourth card (non-honey product, shows range)
- Each card: product name, 1-line character note, real photo, `Детальніше` button
- Section CTA: `Переглянути всі сорти →` → /honey

**Notes:**
- No prices shown anywhere on this block.
- Акація should have a visual badge: "Найпопулярніший" or "Хіт продажів".
- Product cards are managed in Sanity — owner can reorder or feature different products seasonally.

---

### Block 3: Brand Story / Trust Intro
**Job:** Humanise the brand. Differentiate from anonymous sellers. Build emotional connection.

**Content elements:**
- Section heading: `Хто ми`
- Real photo: apiary or family (not staged, not stock)
- 2–3 short paragraphs:
  - Who they are — family from Харківщини, how long they've kept bees
  - What makes their honey different — real apiary, no blending, no additives, seasonal harvest
  - The content dimension — "ми відкрито показуємо нашу роботу на YouTube"
- CTA: `Читати нашу історію` → /about

**Notes:**
- This block converts skeptical visitors. Keep it specific and personal — not generic.
- Do not use phrases like "найкращий мед в Україні" without backing. Say WHY instead.
- "поблизу Харкова" or "на Харківщині" is the right register here.

---

### Block 4: YouTube / Social Proof
**Job:** Reinforce brand credibility through the existing content ecosystem.

**Content elements:**
- Section heading: `Дивіться нас на YouTube`
- Subtitle: `Ми відкрито розповідаємо про пасіку, збір меду та бджільництво.`
- YouTube embed or lazy-loaded thumbnail card (latest or most relevant video)
- Channel name + subscriber count if available
- CTA button: `Відкрити канал` → YouTube main channel URL
- Social row below: Facebook, Instagram, TikTok icons with links

**Notes:**
- **Main YouTube channel only.** Do not link to the secondary channel anywhere on the site.
- If embedding video: use facade loading (click-to-load) to avoid performance penalty.
- Social proof here is implicit: a brand that shows everything publicly is a brand worth trusting.
- YouTube URL and social links are managed in Sanity site config — owner can update without code.

---

### Block 5: How to Order
**Job:** Remove friction. Tell visitors exactly how to get the product before they have to think about it.

**Content elements:**
- Section heading: `Як замовити`
- 3 simple steps (icon + short label):
  1. `Оберіть мед або продукт`
  2. `Залиште заявку або зателефонуйте`
  3. `Отримайте замовлення Новою Поштою або заберіть особисто`
- Phone number — large, tappable `tel:` link
- CTA: `Перейти до каталогу` → /honey

**Notes:**
- 3 steps maximum. This block should feel trivially simple.
- Phone number styling must work on mobile as a tap-to-call link.

---

### Block 6: Customer Reviews
**Job:** Third-party validation to overcome purchase hesitation.

**Content elements:**
- Section heading: `Відгуки покупців`
- 3–4 review cards:
  - Reviewer first name + city (e.g., Олена, Харків)
  - Star rating (visual — 5 stars)
  - Short quote (1–3 sentences, real language — not polished marketing copy)
- Optional link: "Більше відгуків на Google" or Facebook reviews

**Notes:**
- Reviews are managed in Sanity. Owner can add/edit from phone.
- At launch: manually entered real quotes from existing customers (Facebook messages, Instagram DMs, etc.)
- **Never fabricate reviews.** If no reviews are available yet, hide this block until they are.
- Do not use polished language — raw genuine quotes convert better.

---

### Block 7: For Beekeepers
**Job:** Secondary conversion path — capture the beekeeping audience without cluttering the honey buyer experience.

**Content elements:**
- Section heading: `Для пасічників`
- 2-sentence description: бджолопакети (Buckfast, Українська степова, Карніка), бджолосімʼї, вулики
- Single CTA: `Дізнатись більше` → /beekeeper
- Tone: peer-level — "ми пасічники, і розуміємо, що вам потрібно"

**Notes:**
- This is a visually secondary block — smaller treatment than the honey section.
- Beekeepers will recognise the terminology immediately. Do not over-explain to a general audience.

---

### Block 8: Delivery / Location Reassurance
**Job:** Remove the "but do they ship to me?" objection before it forms.

**Content elements:**
- Section heading: `Доставка по Україні`
- Two-line summary:
  - Мед: відправляємо по всій Україні — Нова Пошта / Укрпошта
  - Бджолопакети / вулики: самовивіз або індивідуальна домовленість
- Soft location note: `Ми на Харківщині, поруч із Харковом`
- CTA: `Детальніше про доставку` → /delivery

**Notes:**
- Location in this block: "на Харківщині" — soft and readable.
- Do not use "Пісочинська ОТГ" here. Full address belongs on the contact page and in the footer.

---

### Block 9: Footer
**Content elements:**
- Logo / brand name
- Condensed navigation links
- Phone number (tappable)
- Social media icons: YouTube, Facebook, Instagram, TikTok
- Full address: Коротич, Пісочинська ОТГ, Харківська область, Україна
  *(Full address is appropriate in footer — this is where users expect it)*
- Copyright notice
- Links: Privacy policy

---

## 2. Key Messaging Hierarchy

**Level 1 — Brand promise (hero, OG title, page titles):**
> Справжній мед від сімейної пасіки на Харківщині

**Level 2 — Product truth (catalog, product pages):**
> Сезонний мед без домішок. Акація, Липа, Сонях — кожен сорт зібраний у свій час.

**Level 3 — Process credibility (about page, product descriptions):**
> Ми самі доглядаємо за вуликами, самі качаємо, самі пакуємо. Жодних посередників.

**Level 4 — Community (YouTube section, about page):**
> Більше ніж продукт — ми відкрито показуємо пасіку і ділимось досвідом на YouTube.

**Level 5 — Action (all CTA copy):**
> Замовити / Залишити заявку / Зателефонувати

---

## 3. Page-Level Content Notes

### `/honey` — Honey Catalog
- Page heading: `Наш мед`
- Intro: 2–3 sentences about the range, seasonal harvesting, no additives
- Product grid: all 6 varieties
- Each card: name, 1-line character note, packaging options, CTA
- Packaging note section: explain 1L plastic vs 1L glass (practical vs gift)
- Bottom: delivery reminder + CTA

**Honey variety content notes:**

| Variety | Character | Season |
|---|---|---|
| Акація | Light, delicate, crystallises slowly — ideal for gifting or daily use | Late spring |
| Липа | Classic Ukrainian honey, strong floral aroma, traditionally medicinal | Summer |
| Сонях | Rich, golden, crystallises quickly and solidly | Late summer |
| Різнотравʼя | Complex character from diverse wildflowers — no two batches identical | Summer |
| Сади | Gentle floral honey from orchard blooms — early season | Early spring |
| Ліс | Dark, complex, mineral notes — forest environment | Summer |

---

### `/honey/[slug]` — Individual Honey Page

Each page needs:
- Full Ukrainian name
- Hero image (lifestyle + jar — real photos)
- Description: origin, bloom source, taste profile, texture, crystallisation
- Packaging options (1L plastic, 1L glass)
- Storage guidance
- Suggested uses / pairings (optional — keep brief)
- YouTube video link if a directly relevant video exists
- Order CTA (inline form or phone)
- Related products (2–3 cards)

Content lives in Sanity. Owner can update descriptions, toggle availability, change photos.

---

### `/products` — Other Apiary Products

| Product | Key content |
|---|---|
| Пилок (Pollen) | What it is, how collected from hive, suggested daily use, packaging (TBC) |
| Прополіс (Propolis) | Antibacterial properties, how produced, tincture vs raw, usage guidance |
| Горіхи в меду | 200ml jar, nut variety, honey base used, gift framing |

No prices shown. Order via form or phone.

---

### `/beekeeper` — Beekeeping Products

**Tone throughout:** Peer-to-peer. Expert to expert. Not a sales page — a product information page with a clear inquiry path.

**Page heading:** `Для пасічників`

**Intro (2 sentences):** "Ми пасічники, і розуміємо, що вам потрібно. Пропонуємо бджолопакети, бджолосімʼї та вулики — з індивідуальним підходом."

**Bee Packages section:**
- 4-frame packages
- Breeds: Buckfast, Українська степова, Карніка
- Season: весна — осінь (availability varies — state this clearly)
- No prices shown
- "Щоб дізнатись наявність та вартість — зателефонуйте або залиште заявку"
- Inquiry form with breed preference field

**Bee Colonies section:**
- 10–12 frame colonies
- Seasonal availability
- No prices
- Inquiry / call CTA

**Hives section:**
- Empty hives: дерев'яні та ППУ
- Дадан 10-рамковий + багатокорпусні варіанти
- Hives with bees: by inquiry
- No prices
- Inquiry CTA

**Important note on all beekeeping products:** These involve live animals, seasonal logistics, and individual agreements. The inquiry-first flow is correct and should not be bypassed in v1 or Phase 2.

---

### `/about` — About Page

**Sections:**
1. **Our story** — how and when the family started beekeeping, the journey
2. **Our apiary** — location: Коротич, Харківська область (full detail is appropriate here as a trust anchor). Real photos.
3. **Our approach** — what they do, what they don't do, quality principles
4. **YouTube and content** — why they share openly, channel overview with link
5. **Meet us** — optional: first names and faces if the family is comfortable sharing

**Tone:** Personal, warm, confident. Not corporate. Not boastful. Specific and real.

**Location note:** Full location (Коротич, Харківська область) is appropriate and expected on the About page — visitors come here specifically to learn who and where you are.

---

### `/contact` — Contact Page

**Content:**
- Heading: `Зв'язатись з нами`
- Phone number — large, tappable
- Telegram / Viber links (tap-to-open)
- Business hours if defined
- Inquiry form: Name, Phone, Message, Submit
- Response time note: "Відповідаємо протягом кількох годин"
- Full address: Коротич, Пісочинська ОТГ, Харківська область, Україна
  *(Full detail is expected and appropriate on the contact page)*

---

### `/delivery` — Delivery Page

**Sections:**
1. **Honey and apiary products:** Nova Poshta / Укрпошта, all of Ukraine, estimated timeframes
2. **Packaging for shipping:** brief note on how jars are protected for transit
3. **International:** "Можливе відправлення за кордон — уточнюйте при замовленні" (no infrastructure yet, just awareness)
4. **Beekeeping products:** "Самовивіз або індивідуальна домовленість з доставкою"
5. **Payment methods:** bank transfer (Monobank), cash on delivery — whatever is currently accepted

---

### `/faq` — FAQ Page

**About the products:**
- Чи є у вашому меді цукор або домішки?
- Як правильно зберігати мед?
- Чому мед закристалізувався? Це нормально?
- Який мед найкраще підходить для подарунка?
- Яка різниця між скляною та пластиковою тарою?

**About ordering:**
- Як зробити замовлення?
- Яка мінімальна кількість для замовлення?
- Чи можна замовити оптом?
- Чи можливий самовивіз?

**About delivery:**
- В які регіони ви відправляєте?
- Скільки коштує доставка?
- Чи можете ви відправити за кордон?
- Як упакований мед для відправлення?

**About beekeeping products:**
- Коли доступні бджолопакети?
- Які породи бджіл ви продаєте?
- Як відбувається передача бджолопакетів / бджолосімей?
- Чи можна купити вулик з бджолами?

FAQ content is managed in Sanity — owner can add, edit, or reorder questions without a developer.

---

## 4. Product Category Content Map

```
Products
├── Мед (Honey)                          → /honey and /honey/[slug]
│   ├── Акація                           ← Best seller — feature prominently
│   ├── Липа
│   ├── Сонях
│   ├── Різнотравʼя
│   ├── Сади
│   └── Ліс
│
├── Інші продукти пасіки                 → /products
│   ├── Пилок
│   ├── Прополіс
│   └── Горіхи в меду (200ml)
│
└── Для пасічників (inquiry-only)        → /beekeeper
    ├── Бджолопакети (4-рамкові)
    │   ├── Buckfast
    │   ├── Українська степова
    │   └── Карніка
    ├── Бджолосімʼї (10–12 рамок)
    └── Вулики
        ├── Порожні — дерев'яні (Дадан 10-рамк., багатокорпусні)
        ├── Порожні — ППУ (Дадан 10-рамк., багатокорпусні)
        └── Вулики з бджолами
```

**Packaging SKU map:**

| Product | Packaging | Status |
|---|---|---|
| All honey varieties | 1L plastic | Confirmed |
| All honey varieties | 1L glass | Confirmed |
| Горіхи в меду | 200ml | Confirmed |
| Пилок | TBD | To confirm before launch |
| Прополіс | TBD | To confirm before launch |

**V1 scope:** The above is the complete product scope for v1. Do not add other product categories (lavender, garden products, lifestyle) until Phase 2D or later.

---

## 5. Trust / Reviews / FAQ / Delivery Placement Guide

### Trust element placement

| Element | Home | Product pages | About | Beekeeper | Contact |
|---|---|---|---|---|---|
| Real photos | ✓ | ✓ | ✓ | ✓ | — |
| Location (soft) | ✓ hero | — | — | — | — |
| Location (full) | — | — | ✓ | — | ✓ |
| YouTube link | ✓ block | optional link | ✓ | — | — |
| Customer reviews | ✓ block | ✓ inline | — | — | — |
| Phone number | ✓ header | ✓ header | ✓ header | ✓ header | ✓ prominent |
| "No additives" | ✓ | ✓ | ✓ | — | — |
| Process transparency | — | optional | ✓ | ✓ | — |

### Reviews guidelines
- Managed in Sanity — owner adds from phone
- Format: first name + city (no last names)
- Source: Facebook comments, Instagram DMs, direct messages — with customer knowledge
- 3–4 reviews minimum before showing the block
- Do not show the block with zero reviews
- Phase 2: connect to Google Reviews or Trustpilot widget

### FAQ placement
- Full FAQ at `/faq`
- 2–3 storage/crystallisation questions inline on each honey product page
- 2–3 delivery questions inline on the delivery page
- 2–3 product-specific questions inline on `/beekeeper`

---

## 6. YouTube and Social Proof Integration

### YouTube — main channel only

**Rule:** All YouTube links and embeds across the site must point to the **main Дача TV channel**. The secondary channel must not be linked anywhere on the site.

**Home page:**
- Section: "Дивіться нас на YouTube"
- Facade-loaded embed or thumbnail card of the most relevant video (not necessarily the latest — choose the most trust-building: apiary tour, harvest process, or breed overview)
- Channel description: 1 sentence
- Subscribe CTA
- All other social icons listed below

**About page:**
- 1 embedded video (facade-loaded) — apiary tour or honey extraction
- This is the deepest trust page — a video embed here is high value

**Product pages (honey):**
- Text link only: "Дивіться як ми збираємо [variety] мед →"
- Only where a directly relevant video exists — do not add generic channel links to every product

**Beekeeping page:**
- Text link to a relevant bee package or hive video if available

**Rules:**
- No autoplay anywhere
- Maximum 1 embedded video per page
- YouTube thumbnail images may be used as trust visuals (with link) on product or about pages

### Social platform roles on the website

| Platform | Where referenced on site | Format |
|---|---|---|
| YouTube (main) | Home block, about page, product pages | Embed + icon link |
| Facebook | Footer icons, about page | Icon link |
| Instagram | Footer icons, about page | Icon link |
| TikTok | Footer icons | Icon link only |

### Social icon placement
- **Header:** Phone number takes priority. Social icons are optional in header — only if space allows without cluttering.
- **Footer:** All 4 platforms — YouTube, Facebook, Instagram, TikTok
- **About page:** All platforms listed with a brief note on what each is used for
- **Home YouTube block:** All platforms shown below the YouTube CTA

### Social links in Sanity
All social URLs (YouTube, Facebook, Instagram, TikTok) are stored in Sanity site config. Owner can update them without a developer. Any page that renders social icons pulls from this config.

### Phase 2 social additions
- Instagram feed widget on home or about page (after verifying performance cost)
- Google Reviews widget if review volume warrants it
- Social proof counter: "X+ задоволених покупців" (once data exists and is trustworthy)
