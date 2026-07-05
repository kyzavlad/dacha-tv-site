# AI SEO improvement pipeline (pull model)

A safe, non-destructive loop that improves catalog SEO with AI **without the app
ever calling an AI provider**. n8n orchestrates the loop; Supabase stays the
source of truth. Google Sheets / manual SEO always wins over generated SEO.

```
┌─ GET /api/admin/seo/ai-candidates ─┐   ┌─ AI (in n8n) ─┐   ┌─ POST /api/admin/seo/apply-ai-batch ─┐
│ products needing SEO (JSON)         │→ │ generate UA   │ → │ validate + write allowed fields only  │ → repeat
└─────────────────────────────────────┘   └───────────────┘   └───────────────────────────────────────┘
                                                                         │
                                                          logged to supplier_sync_log
```

All three endpoints are protected by `CRON_SECRET`
(`Authorization: Bearer <CRON_SECRET>` or `x-cron-secret: <CRON_SECRET>`).

## Endpoints

### 1. `GET /api/admin/diag/seo-quality` — read-only status
Coverage counts (meta title / meta description / long description), `seo_status`
breakdown, AI-eligible backlog size, and a sampled list of top categories needing
SEO. Mutates nothing. Query: `?sampleCategories=4000` widens the category sample.

### 2. `GET /api/admin/seo/ai-candidates?limit=100` — read-only candidate batch
Returns published, **public-listable** products (garbage names filtered) that
need SEO improvement, ranked to prefer real sellable products (image + valid
price + category + real name). Rows with human-authored SEO (`seo_status` =
`sheet`/`manual`) or a manual lock are **excluded**. `limit` is 1–1000 (default
100); the endpoint pages internally so a large batch is returned in full rather
than being truncated by the 1000-row per-request ceiling.

Each candidate carries: `id`, `sku`, `name`, `category_slug`, `category_name`,
`price`, `image`, `current` (existing SEO fields), `needs`
(`meta_title`/`meta_description`/`description`), and shared `suggested_targets`.

### 3. `POST /api/admin/seo/apply-ai-batch` — guarded write
Body: `{ "items": [ … ], "dryRun": false }`. `?dry=1` also forces a dry run.
Each item: `{ "sku"|"id": "…", "meta_title"?, "meta_description"?, "description"?, "keywords"? }`
(max 500 items/request).

Per field, the server enforces:
- **Ukrainian language** — must be Cyrillic-dominant and free of Russian-only
  letters (ы/э/ъ/ё).
- **Length** — meta title ≤ 70, meta description ≤ 180 (soft windows 35–65 /
  120–170).
- **No forbidden phrases** — `гарантия качества`, `лучшая цена`, `100% гарантія`,
  medical/superlative claims, etc.
- **No HTML / no `cat-NNN` slug / no keyword-stuffing.**
- **`description` must be non-empty** (HTML is stripped, then validated).

Only these columns are ever written: `meta_title`, `meta_description`,
`description_ua`, `seo_keywords`, plus provenance `seo_status='ai'`,
`seo_source='ai'`, `seo_generated_at`. **Never** touches price, stock, images,
checkout, or supplier data. **Never** overwrites a `sheet`/`manual`/locked row
(guards re-asserted at write time). Every run is logged to `supplier_sync_log`
(`sync_type='product_seo_ai_apply'`, dry runs `…_dryrun`).

Response: `{ ok, dryRun, received, updated, skipped, invalid, errors, errorGroups, results, message }`.

## Provenance priority (highest → lowest)
1. `seo_manual_lock = true` — never touched by any importer/generator.
2. `seo_status = 'manual'` — hand-edited in admin.
3. `seo_status = 'sheet'` — Google Sheets import (human-authored).
4. `seo_status = 'ai'` — this pipeline.
5. `seo_status = 'template'` — deterministic in-app baseline (upgradeable by AI).
6. `seo_status = 'missing'` — no SEO yet.

The AI candidate query and apply guard both exclude 1–3, so **Sheets/manual SEO
stays higher priority than generated SEO**.

## Exact n8n workflow

1. **Schedule** — Cron node (e.g. every 15 min, or manual).
2. **Fetch candidates** — HTTP Request node
   - Method `GET`, URL `https://dachatv.com/api/admin/seo/ai-candidates?limit=50`
   - Header `Authorization: Bearer {{$env.CRON_SECRET}}`
   - Response → JSON. If `count === 0`, stop (backlog empty).
3. **Split** — Item Lists / Split Out node on `candidates` so each product is one item.
4. **Generate SEO (AI)** — OpenAI/Anthropic node, one call per product. Prompt the
   model with the product's `name`, `category_name`, `price`, and `suggested_targets`,
   and instruct it to return JSON:
   ```json
   { "meta_title": "…", "meta_description": "…", "description": "…", "keywords": "…" }
   ```
   Prompt rules (mirror server validation): Ukrainian only; meta title ≤ 65;
   meta description 120–160; description 400–1200 chars describing THIS product;
   no fake guarantees, medical or superlative claims; no HTML.
5. **Reshape** — Set/Code node: attach the product `sku` (or `id`) to each AI
   result and collect them into `{ "items": [ … ] }`.
6. **Dry-run first (recommended once)** — HTTP Request `POST` to
   `…/apply-ai-batch?dry=1` and inspect `errorGroups` before writing.
7. **Apply** — HTTP Request node
   - Method `POST`, URL `https://dachatv.com/api/admin/seo/apply-ai-batch`
   - Header `Authorization: Bearer {{$env.CRON_SECRET}}`, `Content-Type: application/json`
   - Body `{{ { items: $json.items } }}`
   - Response → `{ updated, skipped, invalid, errors, errorGroups }`.
8. **Log / alert** — On `errors > 0` or high `invalid`, send a Telegram message
   with `errorGroups` so the prompt can be tuned. Otherwise loop back to step 2.
9. **Repeat** — because each pull returns the oldest-generated rows first, the
   loop rotates through the whole backlog; re-run until
   `/api/admin/diag/seo-quality` shows `ai_backlog.eligible_products` near 0.

## CLI helpers (same endpoints)

```sh
# Status dashboard
SEO_SITE_URL=https://dachatv.com CRON_SECRET=… pnpm dlx tsx scripts/seo-quality-status.ts

# Export a candidate batch to a file
SEO_SITE_URL=https://dachatv.com CRON_SECRET=… \
  pnpm dlx tsx scripts/export-seo-ai-candidates.ts --limit=50 --out=candidates.json

# Apply results (dry-run first)
SEO_SITE_URL=https://dachatv.com CRON_SECRET=… \
  pnpm dlx tsx scripts/apply-seo-ai-results.ts --in=results.json --dry
```

## Safety guarantees
- No AI provider is called from the app.
- No destructive DB or schema changes; only SEO text columns are written.
- No checkout / order / supplier / import / publish behaviour is touched.
- Human-authored (Sheets/manual/locked) SEO is never overwritten.
- Candidate & diag endpoints are strictly read-only.

---

# Category SEO (same loop, different target)

The category pipeline mirrors the product one but writes to **categories** and
supports long-form Ukrainian copy + FAQ. Same guarantees: app never calls AI,
only SEO columns are written, Sheets/manual/locked categories are never
overwritten, nothing touches products/checkout/supplier/import/sitemap/schema.

## Category endpoints (all CRON_SECRET-protected)

### `GET /api/admin/diag/seo-quality-categories` — read-only status
Coverage counts for meta title / meta description / long description / FAQ, the
`seo_status` breakdown, and the AI-eligible category backlog. Mutates nothing.

### `GET /api/admin/seo/category-ai-candidates?limit=100` — read-only candidates
Published categories needing SEO, excluding `sheet`/`manual`/locked rows.
Code-like slugs are NOT excluded — every published category (which has a public
page) is eligible. `limit` 1–1000 (default 100). Each candidate carries `id`,
`slug`, `name`, `current` (existing SEO), `needs`
(`meta_title`/`meta_description`/`description`/`faq`), `suggested_targets`, and —
so the AI is grounded in what the category really contains — **`products_count`**
(published products in the category) and **`sample_products`** (5–10
representative real product names). Candidates are ranked by `products_count`
DESC (slug breaks ties), so the highest-impact categories come first.

### `POST /api/admin/seo/apply-category-ai-batch` — guarded write
Body: `{ "items": [ … ], "dryRun": false }`. `?dry=1` also forces a dry run.
Each item: `{ "slug"|"id": "…", "meta_title"?, "meta_description"?, "description"?,
"h1"?, "keywords"?, "faq"?: [ { "question": "…", "answer": "…" } ] }`
(max 500 items/request).

Per field, the server enforces: Ukrainian language (Cyrillic-dominant, no
ы/э/ъ/ё), meta length windows, **no forbidden phrases** (`найкраща ціна`,
`гарантия качества`, medical/superlative claims), no HTML / no `cat-NNN`,
non-empty description. FAQ must be an array of `{ question, answer }` with both
sides non-empty Ukrainian (max 10 pairs).

Only these columns are ever written: `meta_title`, `meta_description`,
`description_ua`, `h1`, `seo_keywords`, `faq_json`, plus provenance
`seo_status='ai'`, `seo_source='ai'`, `seo_generated_at`. Guards re-asserted at
write time. Logged to `supplier_sync_log` (`sync_type='category_seo_ai_apply'`,
dry runs `…_dryrun`).

## Exact n8n workflow (categories)

Identical to the product workflow, with these node settings:

1. **Schedule** — Cron (e.g. daily; categories are far fewer than products).
2. **Fetch candidates** — HTTP `GET`
   `https://dachatv.com/api/admin/seo/category-ai-candidates?limit=100`,
   header `Authorization: Bearer {{$env.CRON_SECRET}}`. Stop if `count === 0`.
3. **Split Out** on `candidates`.
4. **Generate SEO (AI)** — one call per category. Give the model `name`, `slug`,
   **`sample_products`**, `products_count`, and `suggested_targets`; require JSON:
   ```json
   { "meta_title": "…", "meta_description": "…", "description": "…",
     "h1": "…", "keywords": "…",
     "faq": [ { "question": "…", "answer": "…" } ] }
   ```
   Prompt rules:
   - **Ground the copy in `sample_products`** — they show what the category
     actually contains. Describe THOSE kinds of products; **do not invent
     unrelated use cases**.
   - If the category `name` is broad or code-like (e.g. "Щітки", "На скутеры"),
     **infer the real meaning from `sample_products`** before writing.
   - Ukrainian only (no Russian, no ы/э/ъ/ё); meta title ≤ 65; meta description
     120–160; description 700–1500 chars that is **commercially useful** — what
     the category includes, how to choose, compatibility/variants, delivery
     across Ukraine, and when to contact a manager; 3–5 FAQ pairs.
   - No fake guarantees, no «найкраща ціна», no medical/superlative claims; no HTML.
5. **Reshape** — attach `slug` (or `id`) to each result → `{ "items": [ … ] }`.
6. **Dry-run once** — `POST …/apply-category-ai-batch?dry=1`; inspect `errorGroups`.
7. **Apply** — `POST …/apply-category-ai-batch` with `{ items }`.
8. **Log / alert** on `errors`/high `invalid`, else loop to step 2 until
   `/api/admin/diag/seo-quality-categories` shows `ai_backlog.eligible_categories`
   near 0.
