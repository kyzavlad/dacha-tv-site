# Localization coverage (v5) — route matrix

Last updated by the v5 localization pass (branch `claude/gracious-brown-sq8ewg`,
commit `afd693c` on top of stable backend `597fdb2`).

## Architecture

- **`lib/i18n.ts`** — locale core: uk canonical (no prefix), ru→`/ru`, en→`/en`;
  `splitLocale`, `localizedPath`, `switchLocaleHref` (preserves path+query+hash,
  never double-prefixes), `getRequestLocale` (reads the `x-dacha-locale` header
  the proxy sets, requires dynamic rendering), `isLocalizablePath` (never
  `/admin`, `/api`). `html lang` is set in `app/layout.tsx` from the same header.
- **`lib/i18n-ui.ts`** — shared nav/switcher labels.
- **`lib/i18n/pages.ts`** — shared `Tr` type + `tr(entry, locale)` resolver with
  intentional Ukrainian fallback, plus the legacy `RAW_DICT`/`pageDict` tree for
  the informational pages (not-found, about, contact, delivery, faq, privacy).
- **`lib/i18n/sections/*.ts`** — domain dictionaries built on the same `tr()`
  resolver: `home.ts` (home sections), `catalog.ts` (catalog listing/search/
  sort/pagination chrome), `shop-ui.ts` (search, checkout, cart drawer — 65
  keys), `manual.ts` (honey/products/flowers/beekeeper/services/lavender +
  shared `detail*` product-detail chrome — 180+ keys). Each exports a `*Dict()`
  resolver function used by server components (`await getRequestLocale()`) and,
  where a component is client-side, a `locale?: Locale` prop or
  `usePathname()`/`splitLocale()`.
- **`lib/i18n/manual-translations.ts`** — dynamic per-row translation reader:
  `getManualTranslations(entityType, ids, locale)` batch-loads rows from
  `manual_content_translations`; `resolveManualField(base, translation, field,
  locale)` resolves with a Ukrainian-content fallback (never returns blank).
- **`manual_content_translations`** table (migration
  `20260721230000_final_full_i18n_media_stock_v5.sql`) — generic
  entity_type/entity_id/locale table for `honey_product`, `apiary_product`,
  `beekeeper_product`, `flower_product`, `service`, `static`.
- Catalog (supplier-sourced) product/category copy stays in its own tables —
  `catalog_product_translations`, `catalog_category_translations` — unrelated to
  the manual-content table above.

## Route matrix

Legend: **Static UI** = all body copy on the page renders from a dictionary
(no hardcoded Ukrainian strings) for every locale. **Dynamic translation** =
DB-backed name/description fields resolve through `getManualTranslations` +
`resolveManualField` (or the catalog translation tables) rather than always
showing the Ukrainian column. **DB rows populated** = whether translation rows
actually exist in the database today (not verifiable from this environment —
see note below). **Fallback** = what a locale sees when no translation row
exists.

| Route | Static UI | Dynamic translation | DB rows populated | Fallback |
| --- | --- | --- | --- | --- |
| `/` (home) | Complete | N/A (no DB copy) | — | — |
| `/catalog`, `/catalog/all`, `/catalog/[category]` | Complete | Complete (catalog_product/category_translations) | Unknown — data task, not verified here | Ukrainian base column |
| `/search` | Complete | Complete (via `CatalogProductCard`/search results) | Unknown | Ukrainian base column |
| `/checkout` | Complete | N/A (order data, not translated content) | — | — |
| Cart drawer | Complete | N/A | — | — |
| `/honey` | Complete | N/A (landing page has no per-product DB copy) | — | — |
| `/honey/[slug]` | Complete UI chrome; **`VARIETY_DETAILS` object (season/taste/crystallisation/storage/uses per honey variety) is Ukrainian-only, not wired to any dictionary** | Complete for name/short_description/description/seo_description | Unknown — no seed/backfill script run in this session | Ukrainian content (name/desc) or Ukrainian-only text (VARIETY_DETAILS) |
| `/products` | Complete | N/A | — | — |
| `/products/[slug]` | Complete | Complete for name/short_description/description | Unknown | Ukrainian content |
| `/flowers` | Complete | N/A | — | — |
| `/flowers/catalog` | Complete | N/A (variety descriptions are dictionary strings, not DB rows) | — | — |
| `/flowers/[slug]` | Complete | Complete for name/short_description/description/seo_description | Unknown | Ukrainian content |
| `/beekeeper` | Complete | N/A | — | — |
| `/beekeeper/[slug]` | Complete | Complete for name/description/seo_description | Unknown | Ukrainian content |
| `/services` | Complete | Complete for name/short_description/image_alt | Unknown | Ukrainian content |
| `/services/[slug]` | Complete | Complete for name/short_description/description/image_alt | Unknown | Ukrainian content |
| `/lavender` | Complete. **Fixed in v5**: page previously used `force-static` + `revalidate=3600`, which prerenders once at build time and cannot vary by the per-request locale header — `/ru/lavender` and `/en/lavender` were silently serving Ukrainian HTML. Changed to `force-dynamic`. | N/A (static content page) | — | — |
| Shared `HourlyCalendar` / `DailyCalendar` | Complete (weekday names, pluralized labels, date formatting via `Intl` locale, validation/success copy) | N/A | — | — |
| `not-found`, `/about`, `/contact`, `/delivery`, `/faq`, `/privacy`, footer, `GeneralContactForm` | Complete (pre-existing, unchanged this session) | N/A | — | — |
| `/admin/**`, `/api/**` | Not localized (intentional — admin-only / API surfaces, `isLocalizablePath` explicitly excludes them) | — | — | — |

## Known gap (disclosed, not silently shipped)

`app/honey/[slug]/page.tsx` — the `VARIETY_DETAILS` object (per-variety season,
taste, crystallisation, storage, recommended-use text) was intentionally left
Ukrainian-only. This is deep botanical/product content where a rushed
translation risked being wrong; all surrounding UI chrome on that page (labels,
breadcrumb, price, packaging, video captions, related products) is fully
localized. This is the one place in the public route surface where body text
can still render Ukrainian for a ru/en visitor.

## Dynamic translation coverage by table

| Table | Resolver | uk | ru/en without a row | Notes |
| --- | --- | --- | --- | --- |
| `manual_content_translations` | `getManualTranslations` + `resolveManualField` | Base columns on `honey_products`/`apiary_products`/`beekeeper_products`/`flower_products`/`services` | Falls back to the Ukrainian base column — never blank | Schema created in `597fdb2`; **no data-population script was run this session**, so row counts are unverified. Do not claim rows are populated without running a seed/backfill and checking counts. |
| `catalog_product_translations` | pre-existing (unchanged) | `name_ua` / supplier feed | `name` (ru) / `name` (en) with uk fallback | Unrelated to manual-content table; pre-existing infrastructure, not touched this session. |
| `catalog_category_translations` | pre-existing (unchanged) | base columns | translation row with uk fallback | Same as above. |

## Static-string audit result

A pass over `app/**` and `components/**` for hardcoded Ukrainian/Russian body
text (excluding admin UI, comments, server logs, test fixtures, and the
intentional `VARIETY_DETAILS` DB-content gap above) found no further genuine
missed public strings as of commit `afd693c`. Every public route's metadata,
breadcrumbs, loading/empty/error states, form placeholders, validation
messages, success messages, cart, checkout, inquiry forms, calendar
components, product cards, category cards, pagination and search controls
resolve through a dictionary or through `resolveManualField` for every locale.

## Tests

- `tests/i18n-catalog.test.mjs`, `tests/i18n-home.test.mjs`,
  `tests/i18n-shop-ui.test.mjs`, `tests/i18n-manual.test.mjs` — each verifies
  every dictionary key resolves to a non-empty string per locale, and that
  representative **body strings** (not just key presence) differ between
  uk/ru/en. A handful of probes are intentionally excluded from the
  uk-vs-ru "must differ" assertion because the underlying word is a genuine
  Ukrainian/Russian cognate (e.g. "Каталог", "Сезон", "Лаванда",
  "Упаковка") — those are checked against `en` instead, which does differ.
