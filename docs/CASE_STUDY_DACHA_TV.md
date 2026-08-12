# Case study — Dacha TV (dachatv.com)

A production Ukrainian ecommerce storefront with a six-figure product catalog,
built and operated with automated supplier synchronisation and an AI SEO
pipeline that a human still controls.

**Every claim below is demonstrable from this repository, its test suite, or the
production database state recorded at the dates given. There are no revenue,
traffic, ranking, conversion or ROAS claims — those have not been measured yet,
and this document will not invent them.**

---

## What it is

| | |
| --- | --- |
| Storefront | Ukrainian moto-parts + farm/apiary ecommerce, UA and RU |
| Published catalog | **106,180 products** (recorded 2026-08-12) |
| Stack | Next.js 16 (App Router, React 19), TypeScript, Tailwind 4, Supabase/Postgres |
| Hosting | Self-hosted on Ubuntu: PM2 + Nginx, atomic release switching, automatic rollback |
| Automation | Supplier feed sync, catalog import/publish, AI SEO pipeline via n8n, Telegram operations alerts |

## The problems this build actually solves

### 1. A six-figure catalog from a supplier feed nobody controls

Supplier feeds are messy: missing names, sub-currency prices, images hidden in
three different fields, categories named `cat-38853`. The pipeline
(`lib/catalog/`, `lib/supplier/`) turns that into a storefront:

- Supplier products → catalog products with collision-safe slugs, normalised
  stock, price-sanity flags (`is_price_suspicious`, a minimum valid price), and
  image resolution that probes `main_image_url`, the `images[]` jsonb and the raw
  supplier blob before giving up.
- New rows always land as **draft**. Publishing is a separate, deliberate step —
  the supplier can never publish itself onto the storefront.
- Category names that are really supplier IDs never reach a customer: they are
  repaired from product data or replaced with a safe human fallback.

### 2. Human-owned content the robot must never overwrite

The hard part of catalog automation is not importing — it is *not* clobbering
the things a person curated. Ownership is explicit and enforced in code
(`lib/catalog/field-ownership.ts`, `source`, `seo_manual_lock`,
`price_manual_lock`, `image_manual_lock`, `inquiry_only`, `lead_type`):

- `source='manual'` products are Dacha TV's own; the supplier refresh does not
  touch them.
- Per-field locks let an operator freeze a price, an image or the SEO of a single
  supplier product while everything else keeps syncing.
- The AI SEO apply path refuses to write to any locked row and never overwrites
  human-authored (`manual` / `sheet`) SEO.

### 3. Bad data becoming a public page

Two supplier rows with unusable names (`<>`, `F0000000024`) once reached the
public catalog and had to be archived by hand. The publish boundary now applies
the **same predicate the storefront uses to decide whether a product is
listable** — so a row that the catalog would refuse to render can no longer be
published, stays `draft` for a human to fix, and never enters the sitemap.
Manual products are exempt by design. Regression-tested, including that already
archived rows can never be revived (`tests/storefront-publish-guard.test.mjs`).

### 4. Localised SEO for 106k products, without hand-writing 106k pages

UA is the source of truth on `catalog_products`; RU lives in per-locale
translation tables (`catalog_product_translations`) and never touches the
Ukrainian columns. The AI never runs inside the app — n8n **pulls** candidates,
generates copy, and **posts it back** to a validating endpoint:

```
GET  /api/admin/seo/ru/product-ai-candidates   → prioritised candidates + targets
POST /api/admin/seo/ru/apply-product-ai-batch  → dry-run → validate → apply
```

Validation is the product, not the generation: Russian-language gates (no
Ukrainian і/ї/є/ґ), meta length windows, banned marketing claims ("лучшая цена",
"100% гарантия", medical claims), no HTML, no technical slugs, no keyword
stuffing, and **atomic writes** — if any required field fails, nothing is
written and no partial SEO lands. Invalid attempts rotate to the back of the
retry queue instead of wedging it.

**Recorded result (2026-08-12): RU meta title, meta description and long
description complete for 106,180 / 106,180 published products; genuine RU
backlog 0.** The recurring RU workflow is switched off because the work is done.

### 5. Selection that stays fast at 106k rows

The candidate endpoint originally paginated `catalog_products` and filtered in
JS. Near completion that scanned 70–80k rows per request and hit the statement
timeout. It was replaced by a trigger-maintained SQL queue read through one
bounded RPC (~9 ms for 100 candidates), with the application only hydrating the
returned ids and re-validating them defensively. The regression test fails if
anything reintroduces a paginated catalog scan.

The same discipline appears throughout: set-based catalog refresh in SQL, bounded
import batches, HEAD `count` queries for diagnostics, and a documented rule that
a per-request path never scans the whole catalog.

### 6. Knowing what customers actually want

Internal site search is logged (query, locale, result count, path, optional UTM —
no PII) and aggregated into an admin view that separates *demand with supply*
from *zero-result demand*. It now also answers the only question that matters
before spending on ads: for each demand cluster, how many matching products are
**published, in stock and carrying a real price** — and therefore whether the
cluster is ad-ready. Same matching logic as the public search, so the number is
what a shopper would actually see.

### 7. Orders that survive their own failure modes

The checkout path (`actions/submitProductOrder.ts`) is written for the real
world:

- Authoritative **stock revalidation fails closed** at order time — a stale cart
  cannot sell an out-of-stock part.
- The customer's order is persisted **before** any supplier call; a supplier API
  failure annotates the order, it never discards it.
- Supplier forwarding has a kill switch (`SUPPLIER_ORDER_MODE`), defaults to a
  non-live mode when unset, and a **test-order guard** that blocks forwarding for
  orders marked as internal even in live mode.
- A supplier HTTP 200 without an order id is recorded as `sent_unconfirmed` —
  never silently reported as success.
- Telegram and webhook notifications are sent on independent channels so one
  failing does not suppress the other, and the primary alert fires from validated
  form data even if the database write later fails.
- Campaign attribution (UTM + referrer + landing page) is captured on landing and
  stored with the order, so "which campaign produced this sale" is answerable in
  the admin list and in the Telegram alert.

### 8. Deployments that can be undone

Self-hosted, but not improvised: a GitHub Actions workflow produces a standalone
Linux artifact after running typecheck, tests, lint and the production build;
the server installs it as a new release directory, flips an atomic symlink,
reloads PM2, health-checks `/api/health`, and **rolls back automatically** if the
health check fails. The three newest releases stay on disk for manual rollback.
Secrets live outside the repository in a `chmod 600` env file the deploy scripts
refuse to run without.

## Engineering principles visible in the code

- **Automation is gated, never trusted.** Kill switches (`SEO_AUTOMATION_ENABLED`,
  `SUPPLIER_ORDER_MODE`) default to *off*/safe, and every mass-write endpoint has
  a dry-run mode.
- **Validation beats generation.** The AI is a content source; the application is
  the gatekeeper, and it rejects atomically.
- **Diagnostics tell the truth.** "Backlog" counts only genuinely actionable work
  — intentional manual exceptions and malformed rows are reported separately, so
  the dashboard can reach zero honestly instead of pressuring someone into
  generating filler text.
- **Every fix ships with the test that would have caught it.** The regressions in
  this codebase — the 1000-row publish cap, the blind catalog scan, partial SEO
  writes, non-UUID ids poisoning a batch, lost order notifications — each have a
  test that fails if they return.

## What we can build with the same playbook

- Custom ecommerce on a large, messy, third-party catalog
- Supplier/marketplace feed integration with human-owned overrides
- AI content pipelines with hard validation and atomic apply
- Multi-locale SEO at six-figure page counts
- Operational automation: order routing, Telegram/n8n alerting, admin tooling
- Self-hosted deployment with atomic releases, health checks and rollback

## Verification

| Claim | Where to check |
| --- | --- |
| 106,180 published products; RU SEO complete; RU backlog 0 | `/api/admin/diag/seo-quality`, `/api/admin/diag/seo-quality-products-localized?locale=ru` |
| Actionable UA backlog (excludes manual exceptions) | `actionable_backlog` in `/api/admin/diag/seo-quality` |
| Publish guard, order safeguards, analytics contract | `pnpm test` — `tests/storefront-publish-guard.test.mjs`, `tests/revenue-path.test.mjs`, `tests/ru-seo-*.test.mjs` |
| Launch readiness of the live site | `pnpm audit:growth` (read-only) |

*Last verified: 2026-08-12.*
