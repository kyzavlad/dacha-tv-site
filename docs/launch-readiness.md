# Dacha TV — launch readiness

Everything needed to take the store from recovery mode to live ecommerce. Read
top to bottom before launch day.

---

## 1. End-to-end order QA (do this before enabling live supplier orders)

The order flow (`actions/submitProductOrder.ts`) is already robust: the customer
notification fires **before** any DB/supplier call, the order is saved to
`orders` + `order_items`, supplier forwarding is gated by `SUPPLIER_ORDER_MODE`,
every outcome is logged with a `[checkout-submit <trace>]` prefix, and a supplier
failure never loses the customer order.

### Supplier order mode (`SUPPLIER_ORDER_MODE` env)
| Value | Behaviour |
| --- | --- |
| `test` (default) | Supplier payload is built and validated; personal.cab accepts it as a **test** — **no real supplier order is created**. Safe for QA. |
| `disabled` | Supplier items are flagged for **manual** handling, never sent. |
| `live` | **Real** supplier orders are created. Only after QA passes. |

### Step 0 — check readiness (no order sent)
```sh
SITE="https://www.dachatv.com"; CRON_SECRET="<your CRON_SECRET>"
curl -sS -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/admin/diag/order-flow" | jq .
```
Confirm: `env.telegramBotToken/telegramChatId/webhookUrl = true`, `env.supplierApiUrl/supplierApiKey = true`, `supplier_payload_build.ok = true`, and `env.supplierOrderMode` is what you expect (`test` for QA).

### Step 1 — place a test order
1. Keep `SUPPLIER_ORDER_MODE=test` (default). Redeploy if you changed it.
2. Pick **one real, in-stock supplier product with a price** — search e.g. `мед`
   or any catalog item on `/catalog`, open it, **Додати в кошик**.
3. Go to `/cart` → **checkout**. Fill: name, a **real phone you control**
   (`+380…`), payment, and a Nova Poshta warehouse. Submit.

### Step 2 — where the order should appear
- **Telegram / n8n**: a `🛒 НОВЕ ЗАМОВЛЕННЯ З САЙТУ` message arrives immediately
  (this is the primary notification, sent before DB/supplier).
- **Admin**: `/admin/orders` — the new order with status `new`, and
  `supplier_order_status` = `test_sent` (supplier item) or `skipped` (manual-only
  order). Open it at `/admin/orders/<id>`.
- **DB**: a row in `orders` and matching rows in `order_items`.
- Re-run the diag: `recent_orders[0]` shows your order; `supplier_status_counts`
  increments.

### Step 3 — what logs to check (Vercel → Functions logs)
Filter by the trace id printed in the response path or search `[checkout-submit`:
- `primary order notification queued` → notification fired
- `order created — id=<uuid>`
- `supplier — mode=test status=test_sent id=<...>` (or `status=skipped`)
- Any `supplier send failed/…` line means the supplier API rejected it — the
  customer order is still saved; a second `⚠️ Замовлення потребує уваги` Telegram
  message is sent for attention statuses only.

### Step 4 — confirm it reached the supplier
- In `test` mode: `supplier_order_status = test_sent` + a `supplier_order_id`
  (or `sent_unconfirmed` if personal.cab returned 200 without an id) confirms the
  payload was accepted by personal.cab's test path.
- In `live` mode (after go-live): `supplier_order_status = sent` with a real
  `supplier_order_id`, and the order appears in the personal.cab journal. Check
  status later via `/api/admin/diag/supplier-order-status` (CRON_SECRET).

### Step 5 — cancel a test order safely
- Test-mode orders create **no real supplier order**, so nothing to cancel on the
  supplier side.
- Remove the local test order: in `/admin/orders/<id>` set status to `cancelled`
  (never deletes history). If you must delete the DB row, do it manually in the
  Supabase table editor (`orders` then `order_items`) — there is **no** automated
  destructive delete.
- If you tested in `live` mode by accident, contact personal.cab to cancel the
  supplier order referenced by `supplier_order_id`.

### Go-live
Only after a clean test pass: set `SUPPLIER_ORDER_MODE=live` and redeploy. Place
one real low-value order to confirm, then you're live.

---

## 2. Storefront UX (shipped in this patch)

- **Search is the main path**: live typeahead (`/api/catalog/suggest`, debounced,
  name + Russian supplier name + SKU, image/price in the dropdown), multi-word
  AND matching, category chips above results, and a helpful empty state.
- **Performance**: requires the `pg_trgm` GIN indexes — **run migration
  `20260630_catalog_search_indexes.sql` first** (see §5). Without it, search
  still works but scans 105k rows; with it, searches are single-digit ms.
- **/catalog** stays curated (bounded human category grid + FAQ), **/catalog/all**
  stays complete. Garbage product names (`<>`, code-only) now render a clean
  `Товар <SKU>` fallback instead of broken titles.

---

## 3. Tiered SEO strategy (do NOT AI-rewrite all 105k)

Run in priority order. All routes are `CRON_SECRET`-gated, dry-run first, and
never overwrite manual-lock / AI / already-filled fields.

- **Tier 1 — priority sheet (highest intent)**: curate a Google Sheet of your
  best products/categories. Import:
  ```sh
  curl -sS -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/admin/cron/import-product-seo-sheet"            # dry run
  curl -sS -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/admin/cron/import-product-seo-sheet?apply=true" # apply
  curl -sS -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/admin/cron/import-category-seo-sheet?apply=true"
  ```
- **Tier 2 — category landing pages**: every category page now ships intro copy,
  a long SEO body (`description_ua`), BreadcrumbList + FAQ schema. Fill category
  meta via the category SEO sheet (Tier 1) or `category-seo`.
- **Tier 3 — top/popular products**: after launch, use the diag + analytics to
  find the most-viewed/most-searched products and hand-curate their sheet rows.
- **Tier 4 — long tail (template)**: fill the remaining published products with
  the deterministic, length-safe, forbidden-phrase-free template generator:
  ```sh
  curl -sS -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/admin/cron/product-seo-template"                 # dry run
  curl -X POST -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/admin/cron/product-seo-template"              # apply
  ```

**Guarantees already in place**: `lib/catalog/seo-validate.ts` enforces length
windows (title ≤70, desc ≤180 hard caps), strips HTML, and blocks forbidden
phrases (medical/guarantee/superlative, RU spam like «лучшая цена»). Titles/
descriptions reject raw `cat-*`/numeric names. Sitemap is now sharded (§4).

> ⚠️ The legacy `lib/catalog/seo.ts` importer (reachable via the pipeline
> "Category SEO from env" card) does **not** run validation. Prefer the sheet
> importers above; avoid the legacy card for production copy.

---

## 4. Local SEO / topical authority (Business Mastery)

Shipped in this patch:
- **Schema.org**: Organization/LocalBusiness (home + contact), Product (catalog +
  honey/flowers/beekeeper), Service (services), **BreadcrumbList** (catalog
  category + product), **FAQPage** (`/catalog`, category pages, `/faq`).
- **Internal linking**: homepage ecosystem grid, `/catalog` category chips + "Усі
  товари", category chips on search results, related-products rails.
- **Local copy**: catalog/category FAQ blocks reference delivery across Ukraine +
  Kharkiv region (смт Коротич), building local + topical authority.

### Google Business Profile checklist (owner does this manually)
- [ ] Create/claim the Google Business Profile for **Дача TV** (смт Коротич,
      Харківська область).
- [ ] Category: e.g. "Farm shop" / "Honey farm" / "Online store"; add services
      (lavender field rental, apiary consulting).
- [ ] Add real photos (садиба, пасіка, лаванда, products), phone, website
      (`https://www.dachatv.com`), hours (06:00–21:00).
- [ ] Add the service area (Kharkiv + всю Україну доставка).
- [ ] Post updates (seasonal honey, lavender season) monthly.
- [ ] Collect reviews from real customers; reply to each.
- [ ] Verify address; keep NAP (name/address/phone) identical to the site footer.
- [ ] Submit the sitemap in Google Search Console (see §6).

---

## 5. Category / data-quality cleanup strategy (no manual editing of 300+ categories)

The approach is **heuristic + curated pins + search-first**, not hand-editing
supplier categories, and it never deletes supplier data:

1. **/catalog landing is curated, bounded, human-only**: `getLandingCategories`
   returns a small (≤80) set, pins the hand-built manual categories (metal,
   natural) first via `sort_order`, and drops technical names via a strengthened
   `isUnusableCategoryName` (numeric, `cat-*`, `sup-*`/`id_*`, `<2` letters, no
   letters at all). `/catalog/all` stays the complete list.
2. **Garbage product names** (`<>`, code-only) are replaced at display time by
   `displayProductName` → `Товар <SKU>`; the DB is never mutated.
3. **Search is the main path** for the 105k catalog (typeahead + chips), so users
   don't rely on browsing raw supplier categories.
4. **To promote/rename categories later** (optional, cheap): edit the handful of
   curated categories in `/admin/catalog/categories`, or add good supplier slugs
   to a pin list — never bulk-edit hundreds by hand.

---

## 6. Verification

```sh
pnpm tsc --noEmit
pnpm build
```

After deploy (replace SITE/CRON_SECRET):
```sh
# Search speed (needs the pg_trgm migration applied)
curl -s "$SITE/api/catalog/suggest?q=мед" | jq '.suggestions | length'
time curl -s -o /dev/null "$SITE/catalog?q=мийка+високого+тиску"

# Sitemap is sharded and complete
curl -s "$SITE/robots.txt"                       # lists /sitemap/0.xml … /sitemap/N.xml
curl -s "$SITE/sitemap/1.xml" | grep -c "<url>"  # product URLs present (not ~1000-capped)

# Order flow readiness (no order sent)
curl -sS -H "Authorization: Bearer $CRON_SECRET" "$SITE/api/admin/diag/order-flow" | jq '{env, supplier_payload_build, supplier_status_counts}'
```

Manual browser checks:
- `/catalog` → curated categories, FAQ block, no `cat-*`/`<>` visible.
- Type in the search box → live suggestions with images; Enter opens a product.
- `/catalog?q=…` → category chips, results or a helpful empty state.
- A product page → image renders, breadcrumb, price, order CTA, related items.
- Place a **test** order (§1) and confirm Telegram + `/admin/orders`.

---

## 7. Old manual content recovery — status

Old manual products (honey/apiary/beekeeper/flowers/services) were **NOT**
recovered automatically (the old deployments/anon key were not reachable in this
environment). This does **not** block launch — the supplier catalog is live.

| Item | Status | Action |
| --- | --- | --- |
| Supplier catalog (105k) | ✅ recovered | live and published |
| Product images | ✅ working | render via SafeImage / images.zone |
| Lavender booking | ✅ working | do not touch |
| honey_products | ⚠️ not recovered | run `scripts/recover-old-manual-content.ts` with old creds/URLs; else **manual rebuild** in `/admin/honey` |
| apiary_products | ⚠️ not recovered | same |
| beekeeper_products | ⚠️ not recovered | same |
| flower_products | ⚠️ not recovered | same |
| services (non-lavender) | ⚠️ partial | lavender + water-house seeded; add others in `/admin/services` |
| Old orders/customers | ❌ optional | not needed for launch |

**Recovery attempt (keep artifacts, don't block launch):**
```sh
# If you have the old project's Vercel token or deployment URLs:
VERCEL_TOKEN=xxx pnpm dlx tsx scripts/recover-old-manual-content.ts
#   or
RECOVER_DEPLOYMENT_URLS="https://<old>.vercel.app" pnpm dlx tsx scripts/recover-old-manual-content.ts
# Review, then (after applying 20260629_manual_content_tables.sql):
cat backups/recovered-items-review.md
# run backups/restore-old-manual-content.sql in the Supabase SQL editor
```
If recovery fails: the manual catalogs are small — **rebuild manually** in the
admin. Classify each as *recovered / not recovered / manual rebuild required /
optional later* using the table above.

Status snapshot any time:
```sh
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm dlx tsx scripts/recovery-status.ts
```

---

## 8. Required migrations for this release

Apply in the Supabase SQL editor (additive, non-destructive):
1. `supabase/migrations/20260630_catalog_search_indexes.sql` — **required** for
   fast search (pg_trgm GIN + sort/keyset indexes).
2. (if not already applied) `20260629_manual_content_tables.sql` — for manual
   content recovery target tables.

No destructive DB changes. No supplier import/publish rerun needed.
