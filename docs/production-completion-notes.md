# Production completion notes (localization, notifications, supplier stock, PM2)

This documents the final store-completion pass: what changed, the exact
production env additions, safe deployment steps, and honest limitations.

## A. Localization (UK / RU / EN)

- English is publicly enabled again: `PUBLIC_LOCALES = ['uk','ru','en']`
  (`lib/i18n.ts`). This automatically restores the `/en` rewrite in `proxy.ts`
  (no more `/en → /` 307 redirect), the EN switcher option, and the EN hreflang
  in `lib/seo.ts` — all driven off `PUBLIC_LOCALES`.
- Locale switching preserves path + query + hash (`LanguageSwitcher` +
  `switchLocaleHref`).
- Every inline `tr({uk,ru})` call now carries an `en` value, and the previously
  hardcoded-Ukrainian components (`ProductCard`, `HoneyCard`, `ApiaryTrustStrip`,
  `FlowerCard`, `Reviews`, `BeekeeperTeaser`, header/menu aria-labels) are
  localized, so an English page never shows Ukrainian UI chrome.
- Catalog content resolution: UK uses base columns; RU uses
  `catalog_product_translations` / `catalog_category_translations` (`locale='ru'`);
  EN uses the EN translation row when present, else **falls back to RU, then UK**
  (`bestProductName` now treats `en` like `ru`; SEO resolvers already per-field
  fall back to UK). Manual content uses `manual_content_translations` with the
  same nonblank fallback chain.
- SEO: `<html lang>` per request, localized canonical + hreflang (uk/ru/en +
  x-default), and the sitemap now emits per-locale `alternates.languages` for
  every URL (`app/sitemap.ts`).
- Read-only translation-coverage diagnostic: `GET /api/admin/diag/translations`
  (CRON_SECRET) reports missing RU/EN product/category/manual rows.

**Limitation:** EN product/category/manual *names and descriptions* fall back to
RU→UK until dedicated EN translation rows are written — intentional per spec. The
`/moto/skutery/*` ad landings remain UK/RU only (EN 404s), so they are excluded
from EN hreflang/sitemap.

## B. Telegram / webhook order notifications

Root cause of "notification did not arrive": the checkout path already sent both
channels correctly, but (1) `WEBHOOK_URL` was undocumented and likely unset, (2)
there was no way to probe config or send a test, (3) no structured per-channel
result. All addressed:

- Shared sender `lib/notify/order-notify.ts` fires **both** channels
  independently, awaits them, never throws, and returns a structured, secret-free
  result (`direct_telegram`/`webhook`: `sent|failed|not_configured` + HTTP status).
- `submitProductOrder` uses it and logs one structured line.
- Diagnostic `app/api/admin/diag/notify` (CRON_SECRET): `GET` → presence booleans
  + last-known result; `POST` → sends a safe test notification.

**Env:** set at least one channel in production:
`TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`, and/or `WEBHOOK_URL`.

## C. Authoritative supplier stock before a live order

Personal.cab exposes **no per-SKU availability endpoint** — only the full ~112k
`get_products` feed, which must never be downloaded during checkout. So the
"preferred" per-SKU preflight is not possible; the safe supported approach is:

- **Freshness gate (fail closed):** at checkout, a forwarded supplier SKU whose
  local `stock_synced_at` is missing or older than `SUPPLIER_STOCK_MAX_AGE_HOURS`
  (default 48) blocks the order with a localized "try again" message. Manual /
  metal rows and all lock semantics are preserved.
- **Post-order reconciliation:** Personal.cab *does* support read-only status
  lookups (`get_order_details`). `GET /api/admin/cron/reconcile-orders`
  (CRON_SECRET, bounded: ≤100 recent orders, one status GET each) re-checks
  accepted orders; on `not_fulfilled`/`cancelled` it preserves the
  `supplier_order_id`, marks the local order as needing attention
  (`supplier_order_status` + `admin_notes`), and sends a Telegram/webhook warning.

**Cadence:** categories stay daily. Because stock only arrives via the full feed,
run the existing `GET /api/admin/cron/refresh-prices` more often than daily
(e.g. every 2–4h) — it is bounded and safe — and schedule `reconcile-orders`
(e.g. every 2h). Do **not** shrink `SUPPLIER_STOCK_MAX_AGE_HOURS` below the actual
stock-sync interval or valid orders will be blocked.

**Limitation:** without a per-SKU endpoint, checkout cannot confirm live
quantity — the freshness gate is a proxy for "recently synced". Reconciliation
catches supplier-side rejection after the fact, not before.

## D. RU product SEO throughput

- `RU_PRODUCT_TARGETS.rules` now carries explicit title rules (35–65 chars, ≥2/≥3
  Russian words, add Russian type + purpose, Latin allowed but not dominant,
  never echo a code/Latin source title, no Ukrainian letters) and worked
  good/bad `title_examples`, shipped to n8n in the candidate response.
- The exact production prompt lives in `docs/ru-product-seo-n8n-prompt.md`.
- Atomic writes, invalid-row rotation, and the strict `meta_description` /
  `description` gates are unchanged. UA and category SEO are untouched.

## E. PM2 / performance

- Audit: the standalone server runs one PM2 fork (`instances: 1`,
  `max_memory_restart: '450M'`, no `--max-old-space-size`). No product-listing
  N+1 translation query exists (detail pages fetch one translation each;
  listings use name columns).
- The historical restarts came from **real memory pressure during the catalog
  import** (the 5000-row refresh batch + a full `catalog_products.slug` read),
  already reduced to a 300-row batch (`EXISTING_REFRESH_BATCH_SIZE = 300`). The
  limit was **not** raised blindly. Keep a single instance.
- Diagnostics: `/api/admin/diag/order-flow`, `/api/admin/diag/notify`,
  `/api/admin/diag/translations` (all CRON_SECRET, secret-free output).

## Exact production env additions

Add to `/var/www/dacha-tv/shared/.env.production` (self-host) / Vercel env:

```
WEBHOOK_URL=<n8n order webhook>            # and/or TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID
SUPPLIER_STOCK_MAX_AGE_HOURS=48            # 0 disables the checkout freshness gate
```

(Existing required vars unchanged: SUPABASE_*, TELEGRAM_*, CRON_SECRET,
ADMIN_SESSION_SECRET, SUPPLIER_API_URL/KEY, SUPPLIER_ORDER_MODE, NEXT_PUBLIC_*.)

## Safe deployment steps

1. Merge the branch; CI build with the required `NEXT_PUBLIC_*` build args.
2. Add the env vars above to the protected `.env.production` (chmod 600).
3. Deploy the standalone build; `pm2 reload dacha-tv` (keep one instance).
4. Verify: `curl` `/`, `/ru`, `/en`, `/catalog/all`, `/ru/catalog/all`,
   `/en/catalog/all` return 200.
5. `POST /api/admin/diag/notify` with `x-cron-secret: <CRON_SECRET>` → confirm the
   test alert arrives in Telegram/n8n.
6. Schedule crons: `refresh-prices` every 2–4h, `reconcile-orders` every 2h
   (both need the `CRON_SECRET`), categories/products daily as before.
7. Keep `SUPPLIER_ORDER_MODE=live` only after step 5 passes and a test order
   round-trips.
