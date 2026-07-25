# Production live integration (n8n, supplier cadence, catalog content)

Follow-up to `docs/production-completion-notes.md`, wiring the site to the REAL
active n8n workflow and the real supplier cadence.

## A. n8n order-notification contract

- **Primary channel = the n8n webhook** `WEBHOOK_URL`
  (`https://n8n.vladkuzmenko.com/webhook/dacha-tv-orders`). The workflow routes
  `product_order_received` / `product_order_fallback` /
  `product_order_supplier_status` to its Telegram Product Order node
  (chat `1070085460`, reads `$json.message`).
- **Direct Telegram is a FALLBACK only** (`lib/notify/order-notify.ts`): it fires
  only when the webhook is not configured, or throws / times out (8 s) /
  returns non-2xx. On a successful webhook send, direct Telegram is **skipped**
  (`telegram_fallback: 'skipped'`) so one event never produces two alerts.
- **Deterministic `event_id`** on every notification for n8n-side dedup:
  - primary order: `product_order_received:<trace>`
  - supplier warning: `product_order_supplier_status:<order_id>:<status>`
  - reconciliation: `product_order_supplier_status:<order_id>:<lifecycle>`
    (stable, so repeated 2-hourly reconciliation of the same state dedupes)
  - diagnostic test: `notification_test:<minute>`
- **Payload contract** (`buildOrderNotifyPayload`, always present, null when
  unknown): `type, event_id, message, order_id, supplier_order_id, name, phone,
  product, items_text, total, payment_method, warehouse, comment, page_url,
  created_at`.
- **Order success is decoupled** from notification delivery (the sender never
  throws; the order is already saved).
- **Secret-free structured log** per send:
  `webhook=sent/failed/not_configured http=… telegram_fallback=…`.
- **Diagnostic** `GET/POST /api/admin/diag/notify` (CRON_SECRET): GET → presence
  booleans + last result; POST → safe test through the same primary/fallback
  chain.

### n8n dedup contract (optional)
The workflow may add an idempotency guard keyed on `$json.event_id` (e.g. a
"Remove Duplicates"/cache node) so a retried webhook or a repeated
reconciliation status does not re-alert. No workflow change is required for the
site to function — the site already avoids double-sends. **The complete active
workflow is NOT replaced.** If a workflow change is ever wanted, add it as
`docs/n8n/Dacha-TV-orders-PRODUCTION.json`, preserving credential references,
node IDs, and all non-order booking branches.

## B. Supplier stock & sync cadence

- Supplier order **046064 / SKU AT-0132** is the tracked incident: shown
  available locally, accepted by the supplier, then marked unfulfilled.
  `remaining_total=0` only means the catalog matches the **last raw snapshot** —
  not that the snapshot is fresh.
- **Diagnostic** `GET /api/admin/diag/supplier-sync` (CRON_SECRET) reports:
  cycle id, status, feed_total/processed, current/next offset, last full-cycle
  completion + duration, last catalog stock refresh, stale-stock count + sample
  stale SKUs, and `safe_for_checkout`.
- **Resumable & 15-min-safe:** the products sync already persists a cursor in
  `supplier_sync_state` (`next_offset`, `planResume`), so it can run every 15 min
  and resume mid-cycle. **Overlap is prevented by `flock`** in
  `deploy/self-host/cron.d-dacha-tv` (each job has its own lock; a slow run skips
  the next tick and resumes later). The full ~112k feed is never downloaded at
  checkout.
- **Bounded refresh batch stays 300** (`EXISTING_REFRESH_BATCH_SIZE`) for the
  3.7 GiB box.
- **Recommended cadence** (see `deploy/self-host/cron.d-dacha-tv`): categories
  daily; supplier products every 15 min; import staggered +7 min; publish hourly;
  reconciliation every 2 h.
- **Freshness threshold** `SUPPLIER_STOCK_MAX_AGE_HOURS` (default 48). It can be
  lowered toward the products+import interval (e.g. 2–4 h) ONCE the 15-min cron
  is running reliably; never below that interval or valid orders are blocked.
- **Reconciliation** (`/api/admin/cron/reconcile-orders`): preserves the
  supplier order id, detects unfulfilled/cancelled, marks the local order
  (supplier_order_status + admin_notes), and sends `product_order_supplier_status`
  through the n8n workflow.
- **Honest limitation:** the supplier exposes **no per-SKU real-time
  availability API** — only the full `get_products` feed. There is no way to
  confirm live quantity for one SKU at checkout; the freshness gate + post-order
  reconciliation are the safe substitute.
- Manual/metal products and all ownership locks (`source='manual'`,
  `price_manual_lock`, `image_manual_lock`) are preserved.

## C. UK / RU / EN catalog content

- **UK**: UI + static content Ukrainian; supplier product/category content from
  the Ukrainian base columns (`name_ua`, `description_ua`).
- **RU**: UI + static content Russian; product/category names from the Russian
  supplier column (`catalog_products.name`) or `catalog_*_translations`
  (`locale='ru'`), falling back to Ukrainian only when RU is genuinely absent.
- **EN**: every UI label/heading/form/validation/footer/metadata/static body in
  English; dynamic product/category content falls back **EN translation → RU
  supplier/translation → UK base** (`bestProductName` treats `en` like `ru`; the
  SEO resolvers fall back per field). No Ukrainian UI chrome on an English page.
- The supplier feed already provides both Ukrainian (`name_ua`) and Russian
  (`name`) product fields; the raw sync maps both — we do **not** invent
  translations.
- **Coverage** is reported by `GET /api/admin/diag/translations` (missing RU/EN
  product/category/manual rows).

## D. RU product SEO

Unchanged from the prior patch: application-side validator improvements stay;
`docs/ru-product-seo-n8n-prompt.md` matches the production validator. RU product
SEO remains inactive until its n8n AI prompt is manually replaced and one manual
run updates ≥80/100 candidates. No n8n workflow edits from code.

## Exact env changes (add to the protected .env.production)

```
WEBHOOK_URL=https://n8n.vladkuzmenko.com/webhook/dacha-tv-orders
# TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID=1070085460 remain the FALLBACK channel
SUPPLIER_STOCK_MAX_AGE_HOURS=48
```

## Exact deploy commands

```
# on the server, as the deploy user
sudo install -m 0644 -o root -g root \
  /var/www/dacha-tv/current/deploy/self-host/cron.d-dacha-tv /etc/cron.d/dacha-tv
# verify liveness + diagnostics (CRON_SECRET from the protected env)
curl -fsS http://127.0.0.1:3030/api/health
curl -fsS -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3030/api/admin/diag/notify
curl -fsS -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3030/api/admin/diag/supplier-sync
curl -fsS -H "x-cron-secret: $CRON_SECRET" -X POST http://127.0.0.1:3030/api/admin/diag/notify
```
Do not merge or deploy as part of this task.
