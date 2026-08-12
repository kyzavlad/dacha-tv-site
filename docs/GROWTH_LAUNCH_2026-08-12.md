# Dacha TV — controlled paid-search launch plan (2026-08-12)

Status of this document: the **method, the ranking rules and the technical
readiness** are final and implemented in code. The **inventory numbers per
cluster are recomputed live** — this session had no production database or
production HTTP access (the build environment's egress policy blocks
`dachatv.com`), so every number below that is not derived from the repository is
marked as *"recompute"* rather than asserted.

Recompute in one place: **`/admin/catalog/search-insights`** → *"Готовність до
реклами (Google Ads)"*. That table now reports, per demand cluster: searches in
the last 30/7 days, matching published products, how many are **in stock**, how
many have a **real displayable price**, whether the cluster is **ad-ready**, and
the exact landing URL. It is computed from live data with the same matching the
public search uses, so what the table shows is what a shopper can actually reach.

Nothing in this document estimates CTR, CPA, ROAS, conversion rate or revenue.
We have not earned those numbers yet — the first controlled test is how we earn
them.

---

## 1. How a cluster qualifies

A cluster may receive paid clicks only when all four hold (`lib/catalog/ad-readiness.ts`):

| Gate | Threshold | Why |
| --- | --- | --- |
| Observed internal demand | ≥ 3 searches / 30 days | Real intent from our own visitors, not a guess |
| Matching published products | > 0 | The landing page must not be empty |
| In stock | ≥ 20 | A paid click must reach a page that can be fulfilled |
| Real, non-suspicious price | ≥ 20 | `?buyable=1` products only — a price-on-request page cannot convert an ad click |

`is_price_suspicious` and `MIN_VALID_PRICE_UAH` are already enforced by the
storefront, so "buyable" here means the same thing the shopper sees.

**Landing page for every cluster:** `/search?q=<cluster>&buyable=1`.
This is deliberate — it guarantees the click lands on products that show a price
and can be added to the cart, using the existing, tested search + filter path.
No new landing-page templates are introduced for the first test.

## 2. Candidate clusters (ordered by last observed evidence)

Ordering below reflects the last recorded internal-search demand and the last
recorded ad-ready inventory. **Confirm against the admin table before funding
anything** — if the live numbers disagree, the live numbers win.

| # | Cluster | Intent | Landing URL | Last observed ad-ready inventory (recompute) |
| --- | --- | --- | --- | --- |
| 1 | Карбюратори / карбюратор | Replacement part, high commercial intent | `/search?q=карбюратор&buyable=1` | ~753 |
| 2 | Варіатори / вариатор | Replacement part, model-specific | `/search?q=варіатор&buyable=1` | ~561 |
| 3 | Глушники / глушитель | Replacement part | `/search?q=глушник&buyable=1` | ~306 |
| 4 | Амортизатори / амортизатор | Replacement part, wear item | `/search?q=амортизатор&buyable=1` | ~239 |
| 5 | Ремені варіатора / ремень вариатора | Consumable — highest repeat-purchase potential | `/search?q=ремінь варіатора&buyable=1` | ~208 |

Held back for now (documented so the decision is not re-litigated):
**замки** (~214) — mixed intent, "замок" also matches non-moto items;
**вилки** (~88) — below the in-stock floor, and fork buyers usually need
model-level fitment we do not yet expose as a filter.

### Per-cluster brief

Each cluster uses the same conversion configuration:

- **Primary conversion:** `purchase` (GA4) + the Google Ads purchase conversion.
  Fires **only** after the internal order row is created — see §4.
- **Secondary (observation only, not for bidding in the first test):**
  `begin_checkout`, `add_to_cart`, `phone_click`.

**1. Карбюратори** — biggest ad-ready pool, unambiguous replacement intent.
Example intents: `карбюратор на скутер`, `карбюратор 4т 139qmb`, `купити карбюратор скутер`.
Negatives: `ремонт`, `чистка`, `ультразвук`, `своими руками`, `авто`, `бензопила`, `мотоблок`, `відео`.
Blocker: none known.

**2. Варіатори** — strong intent, model-specific queries convert best.
Example intents: `варіатор на скутер`, `вариатор honda dio`, `купить вариатор скутер`.
Negatives: `ремонт`, `налаштування`, `принцип роботи`, `авто`, `cvt`, `трактор`.
Blocker: none known.

**3. Глушники** — solid pool, watch for tuning-vs-replacement intent.
Example intents: `глушник на скутер`, `глушитель для скутера купить`, `прямоток скутер`.
Negatives: `ремонт`, `зварювання`, `авто`, `бензопила`, `своими руками`.
Blocker: none known.

**4. Амортизатори** — wear item, repeat demand.
Example intents: `амортизатор задній скутер`, `амортизатор 340 мм`, `купить амортизатор скутер`.
Negatives: `авто`, `ремонт`, `відновлення`, `квартира`, `меблі`.
Blocker: none known — but this is the first cluster where fitment questions are
likely, so route phone clicks carefully.

**5. Ремені варіатора** — smallest pool of the five, best repeat-purchase
economics (a consumable).
Example intents: `ремінь варіатора 669`, `ремень вариатора купить`, `ремінь на скутер розмір`.
Negatives: `ремонт`, `авто`, `газонокосарка`, `генератор`, `своими руками`.
Blocker: verify the in-stock count is still ≥ 20 before funding.

## 3. Structure for the first test

- One campaign, **search only**, no Display/Partners.
- One ad group **per cluster** — never one ad group for the whole 106k catalog.
- Phrase/exact match to start; broad match only after real conversion data exists.
- Shared negative list: `ремонт`, `своими руками`, `бесплатно`, `схема`, `відео`,
  `инструкция`, `бу`, `авито`, `olx`, `работа`, `авто` (unless the cluster needs it).
- Geo: Ukraine only. Language: Ukrainian + Russian (the storefront serves both).
- Start with the single strongest cluster (carburetors) and only widen once the
  purchase conversion has been observed firing in the Ads UI with a real order.

## 4. Conversion tracking — what is already implemented

`lib/analytics/gtag.ts` (verified by `tests/revenue-path.test.mjs`):

| Event | When it fires | Payload |
| --- | --- | --- |
| `view_item` | Product detail render | item_id (supplier SKU or slug), item_name, price, item_category, UAH |
| `add_to_cart` | Every add path (product page, cards, sticky bar) | item + quantity, value = price × qty, UAH |
| `begin_checkout` | Once per checkout, guarded by a ref | items + cart value, UAH |
| `purchase` | **Only after** `submitProductOrder` returns `success` | transaction_id = internal order id, value = order total, UAH, items |
| Google Ads `conversion` | With `purchase`, only when both `NEXT_PUBLIC_GOOGLE_ADS_ID` and `NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL` are set | send_to, transaction_id, value, UAH |
| `order_submit_test` | Test/internal orders instead of `purchase` | Never fires the real Ads conversion |
| `phone_click` | Phone CTAs (product, header, mobile menu) | location, page path |
| `search` | Search results page | search_term, result_count |

**Duplicate-purchase protection:** the purchase event is fired once in the
submit handler after a successful result, the cart is then cleared and the page
switches to the success state. A refresh or back-navigation lands on an empty
cart, so no second order and no second `purchase`. `transaction_id` is the
internal order id, so Google Ads also de-duplicates server-side on that key.

**Attribution:** `lib/analytics/attribution.ts` captures UTM + referrer host +
landing path into a first-party cookie on landing, and `actions/submitProductOrder.ts`
folds it into the order's existing `source` column and into the Telegram alert
(`📊 Source: google / cpc / <campaign> · LP: /search`). No schema change, no
extra PII. So "which campaign produced this order" is answerable in the admin
order list and in the Telegram message, not only in GA4.

### Required production environment variables (names only)

Set in `/var/www/dacha-tv/shared/.env.production` **and** as GitHub Actions
secrets — `NEXT_PUBLIC_*` values are inlined into the client bundle at build
time, so a server-only value is too late (`tests/analytics-build-vars.test.mjs`
enforces the build wiring):

```
NEXT_PUBLIC_GA_MEASUREMENT_ID
NEXT_PUBLIC_GOOGLE_ADS_ID
NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL
NEXT_PUBLIC_SITE_URL
NEXT_PUBLIC_ANALYTICS_DEBUG        (optional, "1" to log events in prod)
```

No account ids are hardcoded anywhere in the repository.

## 5. Pre-launch checklist

Technical (done in code — re-verify after deploy with `pnpm audit:growth`):

- [x] `purchase` fires only after a persisted order
- [x] Order value + UAH currency on the conversion
- [x] Campaign attribution persisted on the order and surfaced in Telegram
- [x] Ad-ready inventory is measured, not assumed (`/admin/catalog/search-insights`)
- [x] Landing pages are price-filtered and add-to-cart capable
- [x] Junk supplier products can no longer become public (publish guard)
- [x] `robots.txt` / sitemap / hreflang / canonical verified by the audit script

Human, before spending anything:

1. Confirm the Google Ads account's advertiser verification and billing status
   (do not assume the state of an old account).
2. Confirm the conversion action exists in Google Ads and its **label** matches
   `NEXT_PUBLIC_GOOGLE_ADS_PURCHASE_LABEL` in the deployed build.
3. Choose the initial daily budget for a single-cluster test.
4. Place one real test order (or use the existing test-order marker path, which
   never contacts the supplier) and confirm the conversion appears in Ads.

## 6. What we measure in the first test

Only what we can observe honestly: impressions/clicks/spend from Ads, `purchase`
count and value from GA4, and orders in the admin list with their attribution
line. After that data exists we can talk about CPA and which cluster deserves
more budget — and improve the winning landing path instead of continuing broad
development.
