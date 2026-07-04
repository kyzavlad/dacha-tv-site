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
`sheet`/`manual`) or a manual lock are **excluded**. `limit` is 1–500 (default 100).

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
