# Localization coverage (Section D) — before / after

## Architecture

- **`lib/i18n.ts`** — locale core (unchanged): uk canonical (no prefix), ru→`/ru`,
  en→`/en`; `splitLocale`, `localizedPath`, `switchLocaleHref` (preserves
  path+query+hash, never double-prefixes), `getRequestLocale` (reads the
  `x-dacha-locale` header the proxy sets), `isLocalizablePath` (never `/admin`,
  `/api`). `html lang` is set in `app/layout.tsx` from the same header.
- **`lib/i18n-ui.ts`** — shared nav/switcher labels (pre-existing).
- **`lib/i18n/pages.ts`** — **NEW** centralized page-body dictionary. Nested
  `{uk, ru, en}` tree, deeply resolved per locale by `pageDict(locale)`, with an
  intentional Ukrainian fallback via `tr()`. This is the single source of truth
  for static page-body copy — no scattered inline ternaries.
- Dynamic DB copy stays in the translation tables
  (`catalog_product_translations`, `catalog_category_translations`), now extended
  with `name`, `short_description`, `seo_description` columns (migration v4).

## Before

Choosing RU/EN only re-labeled the Header/nav (via `i18n-ui`). Every static page
**body** stayed Ukrainian — `not-found`, `about`, `contact`, `delivery`, `faq`,
`privacy`, the footer, forms and card CTAs did not react to locale at all
(verified: 0 `getRequestLocale`/`locale` references in those files).

## After — fully body-localized (uk/ru/en), with tests

| Surface | Scope localized |
| --- | --- |
| `not-found` | title, body, both CTAs |
| `/delivery` | eyebrow, title, intro, all 5 sections, questions CTA |
| `/privacy` | title + all 8 sections |
| `/faq` | eyebrow, title, intro, category headings, CTA block |
| `/about` | header, story (3¶), apiary facts (4), approach (3¶), YouTube block, trust, CTA |
| `/contact` | header, info labels, phone/telegram/address/response/social, form title |
| Footer (shared) | tagline, column headings, nav labels, telegram, bottom links |
| `GeneralContactForm` | labels, placeholders, **validation messages**, submit/sending, success block |
| `CatalogProductCard` | featured badge, price-on-request, inquiry CTA, out-of-stock, availability, “details” |
| Product detail | availability label + badge, add-to-cart / buy-now out-of-stock (this pass); SEO via translation rows |

`tests/i18n-pages.test.mjs` proves page **bodies** (not just header) differ across
uk/ru/en for `not-found`, `delivery`, `privacy`, `about`, `contact`, `faq`, plus a
guard that every dictionary leaf has ru+en (no accidental Ukrainian-only strings).

## After — partial (chrome/labels localized; long body copy or dynamic rows pending)

| Surface | State |
| --- | --- |
| `/` (home) | Header/footer localized; section components (Hero, EcosystemSections, BrandStory, HowToOrder, Reviews, DeliveryTeaser) still render Ukrainian body copy — they’re component-composed and not yet wired to `pageDict`. Shared `shop.*` keys are ready. |
| `/catalog`, `/catalog/all`, `/catalog/[category]` | product cards + availability localized; listing chrome (sort/filter/pagination/empty) has dictionary keys in `shop.*` but the listing pages are not yet wired. |
| `/search` | chrome pending (keys ready in `shop.*`). |
| `/checkout` | payment/stock messages localized where shared; full form-label pass pending. **Checkout/payment behavior unchanged** — only visible copy is in scope. |
| `/products`, `/honey`, `/flowers`, `/beekeeper`, `/services`, `/lavender` (+ `[slug]`) | manual Dacha TV content — bodies are DB-backed; need RU/EN translation rows (tables + `name/short_description/seo_description` columns now exist; population is a data task). |

## Dynamic content localization

| Table | uk | ru | en |
| --- | --- | --- | --- |
| `catalog_products` (name) | `name_ua` | supplier Russian `name` (safe fallback), then `catalog_product_translations.name` | `catalog_product_translations.name` → intentional uk fallback |
| product SEO (title/desc/keywords/description) | base columns | `catalog_product_translations` (locale=ru) | `catalog_product_translations` (locale=en) |
| `catalog_categories` | base columns | `catalog_category_translations` (ru) | `catalog_category_translations` (en) |
| metal products (11) | `metal-content.ts` UA → `catalog_products` | `metal-content.ts` RU → translation rows | `metal-content.ts` EN → translation rows |

`displayProductName(product, 'ru')` already prefers the Russian supplier feed name,
so RU product cards are non-empty even before translation rows exist. EN cards fall
back to the Ukrainian name until EN translation rows are populated — this is the
**intentional** fallback (never an empty title).

## Coverage counts

- Static UI strings centralized in `pageDict`: **~130 leaves × 3 locales**, 100%
  ru+en filled (enforced by test).
- Fully body-localized routes/components: **10** (6 static pages + footer + 2 forms/cards + product-detail availability).
- Partial routes (chrome only / pending dynamic rows): **~15** (home sections, catalog listing, search, checkout form, 6 manual-content sections).
- Dynamic RU/EN product SEO readiness: **infrastructure complete**; row population
  is a bounded batch/n8n job (see `docs/n8n-automation-order.md`), NOT claimed as
  content-complete.

## EN supplier-catalog translation pipeline (bounded, n8n-compatible)

Never translate all ~112k products in one request. The pipeline is candidate →
apply, bounded per batch (mirrors the existing UA/RU SEO batch approach):
1. Select a bounded page of published supplier products lacking an `en` row.
2. Emit EN candidates (translation service / n8n node) → upsert
   `catalog_product_translations(locale='en')`.
3. Repeat until no candidates remain. Each batch is idempotent (upsert on
   `product_id,locale`) and capped, so it fits the 15-min n8n cadence.
