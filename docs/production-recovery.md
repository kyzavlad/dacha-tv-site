# Production recovery — dacha-tv-site

Quick runbook for restoring and verifying production after an outage (e.g. a
missing Supabase env in Vercel). Lavender booking runs paid ads, so booking
health is the top priority.

## Critical environment variables

These must be present in **Vercel → Project → Settings → Environment Variables**
for the **Production** environment:

| Variable | Used for |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (public client + admin client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public/anon reads (catalog, availability) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side admin reads/writes (bookings, backups, health) |
| `CRON_SECRET` | Protects all `/api/admin/*` endpoints (health, backups, cron) |

> ⚠️ **Vercel "Sensitive" env vars cannot be read back after saving.** Once a
> value is saved as Sensitive, the dashboard will never show it again — you can
> only overwrite it. Keep the real values in your own password manager. If a
> value is lost, re-paste a fresh one from the Supabase dashboard
> (Project Settings → API) and redeploy.

After changing any env var you must **redeploy** for it to take effect.

## 0. Rebuilding on a NEW Supabase project

Use this when the original Supabase project is lost/inaccessible (blocked
account) and production shows `Invalid API key`. Goal: get lavender booking and
`/admin/bookings` working again. Catalog data recovery is separate and can wait.

### 0.1 Create the new Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**. Pick a strong DB
   password and a region close to users (e.g. EU).
2. Wait for it to finish provisioning.
3. Open **Project Settings → API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (secret — keep safe)

### 0.2 Run the rebuild migration

In the new project: **SQL Editor → New query**, paste the entire contents of
`supabase/migrations/20260628_rebuild_new_supabase.sql`, and **Run**. It is
idempotent (safe to re-run) and creates all tables, indexes, RLS policies, and
seeds the lavender + water-house services.

Then paste and run `supabase/verify-rebuild.sql` to smoke-test: it checks counts,
inserts one test booking, confirms it shows in admin shape and that availability
detects the booked hours, then deletes the test row.

```sql
-- Quick manual check (also in verify-rebuild.sql)
select count(*) from services;   -- expect >= 1 (lavender seeded)
select count(*) from bookings;   -- expect 0 on a fresh project
select slug, price_uah, slot_start_hour, slot_end_hour, status
  from services where slug = 'orenda-lavandovoho-polia';
```

### 0.3 Set the Vercel env vars + redeploy

In **Vercel → Settings → Environment Variables** (Production), set the four
variables from the table above using the new project's values. Keep
`CRON_SECRET` (generate a new random string if it was lost). Then **redeploy**.

Proceed to section 1 (health) and section 3 (booking test) to confirm recovery.

## 1. Verify production health

Health probe is read-only and never prints secret values (only presence
booleans). Returns HTTP 200 only when env is present **and** the core
booking tables (`bookings`, `services`) respond.

```sh
# Replace with your real values
SITE="https://www.dachatv.com"
CRON_SECRET="<your CRON_SECRET>"

curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "$SITE/api/admin/health/supabase" | jq .
```

Expected (healthy):

```json
{
  "ok": true,
  "env": { "supabaseUrlPresent": true, "anonKeyPresent": true, "serviceRolePresent": true },
  "checks": {
    "bookingsRead": true,
    "servicesRead": true,
    "catalogCategoriesRead": true,
    "catalogProductsRead": true
  },
  "errors": [],
  "timestamp": "..."
}
```

- `ok: false` / HTTP 500 → env missing or Supabase unreachable. Fix env + redeploy.
- An entry in `errors` for a single table → that table may be missing or mid-migration.

## 2. Export critical backup

Downloads JSON of the critical business tables only (`bookings`, `inquiries`,
`services`, `catalog_categories`, `orders` if present, `settings`/`site_settings`
if present). The large catalog/supplier feeds are intentionally excluded.

```sh
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "$SITE/api/admin/backup/critical" -o critical-backup.json

# Sanity-check counts without dumping personal data
jq '{project, exportedAt, counts, missingTables, errors}' critical-backup.json
```

Optional lightweight catalog snapshot (identity/SEO fields only):

```sh
curl -sS -H "Authorization: Bearer $CRON_SECRET" \
  "$SITE/api/admin/backup/catalog-snapshot?limit=5000" -o catalog-snapshot.json
```

### Local backup script (terminal, no HTTP)

Exports `bookings`, `services`, `inquiries`, `site_settings` straight to
`backups/dachatv-critical-YYYY-MM-DD-HH-mm.json` (gitignored). Uses the current
production service-role credentials from your shell env:

```sh
NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service role key>" \
  pnpm dlx tsx scripts/backup-critical.ts
```

## 3. Test lavender booking after deploy

```sh
# Availability must return 200 (a date in the lavender season)
curl -sS "$SITE/api/bookings/availability?date=2026-06-28&type=lavender" | jq .
```

Then test the full flow in a browser:

1. Open `$SITE/lavender` — it must load fast (it is statically rendered).
2. Pick a date and an hour in the calendar.
3. Submit a test booking with a real phone number.
4. Confirm a Telegram/n8n notification arrives.
5. Confirm the booking appears in the admin bookings list.

If Supabase is overloaded, the submit falls back to a notification-only path:
the visitor still sees a success message and an alert is sent flagged
`lavender_booking_fallback` / `db_timeout_unstored` with a
`FALLBACK-LAVENDER-<timestamp>` id — handle those manually.

## 4. Recover OLD data later (if old credentials return)

If the original Supabase project becomes accessible again, copy its data into the
new project with `scripts/migrate-from-old-supabase.ts`. It upserts (never
deletes), so it is safe to re-run; bookings/services/inquiries/site_settings copy
by default, catalog tables only with `--catalog`.

```sh
# 1) Dry run first — counts only, writes nothing
OLD_SUPABASE_URL="https://<old>.supabase.co" \
OLD_SUPABASE_SERVICE_ROLE_KEY="<old service role>" \
NEW_SUPABASE_URL="https://<new>.supabase.co" \
NEW_SUPABASE_SERVICE_ROLE_KEY="<new service role>" \
  pnpm dlx tsx scripts/migrate-from-old-supabase.ts --dry

# 2) Real copy of booking/operational tables
#    (drop --dry; add --catalog to also copy catalog tables)
OLD_SUPABASE_URL=... OLD_SUPABASE_SERVICE_ROLE_KEY=... \
NEW_SUPABASE_URL=... NEW_SUPABASE_SERVICE_ROLE_KEY=... \
  pnpm dlx tsx scripts/migrate-from-old-supabase.ts
```

Do **not** run this now — the old project is currently inaccessible.

## 5. Full supplier product sync (all ~112k products)

The personal.cab feed returns the entire catalog in one response with no
server-side paging, so the sync downloads it once and processes a window
`[offset, offset+limit)` per call, returning `nextOffset`/`done` to resume. A
plain call (no params) stays at one safe 1000-row window; `mode=full` processes
as many windows as fit in the per-call time budget (capped under the 60s function
limit). Loop it from a terminal until `done`:

```sh
SITE="https://www.dachatv.com"; CRON_SECRET="<your CRON_SECRET>"
off=0
while :; do
  r=$(curl -s -H "Authorization: Bearer $CRON_SECRET" \
    "$SITE/api/admin/cron/sync-products?mode=full&offset=$off")
  echo "$r" | jq '{totalInFeed,processed,inserted,updated,nextOffset,done,errors}'
  done=$(echo "$r" | jq -r '.done'); off=$(echo "$r" | jq -r '.nextOffset')
  [ "$done" = "true" ] && break
  [ -z "$off" ] || [ "$off" = "null" ] && { echo "no nextOffset (possible timeout) — aborting"; break; }
done
```

Verify the table grew past 1000:

```sql
select count(*) from supplier_products;
```

> This only fills `supplier_products` (the raw supplier layer). Promoting items
> into the public `catalog_products` storefront is a separate import/publish step
> — run it only when booking health is green (section 6).

## 6. Recover OLD manual content from old Vercel deployments

The old manual content (honey, products, flowers, beekeeper, services) lived in
the lost DB but is still served by old Vercel deployments. Recover it in three
steps (outputs land in `backups/`, which is gitignored):

```sh
# Needs Vercel creds: ~/.vercel/auth.json + .vercel/project.json (run `vercel link`)
pnpm dlx tsx scripts/recover-old-public-content.ts   # crawl deployments → recovered-public-content.json
pnpm dlx tsx scripts/scrape-old-public-items.ts      # scrape each item   → recovered-old-items.json
pnpm dlx tsx scripts/generate-restore-sql-from-recovered-items.ts  # → restore-old-manual-content.sql + recovered-items-review.md
```

Inspect before importing:

```sh
jq '{deploymentsScanned,totalItems}' backups/recovered-public-content.json
jq '{totalItems,bySection}'          backups/recovered-old-items.json
sed -n '1,40p'                       backups/recovered-items-review.md
```

The legacy content tables (`honey_products`, `flower_products`,
`beekeeper_products`, `apiary_products`) are created by
`supabase/migrations/20260629_manual_content_tables.sql` — apply it on the new
project first (the generated restore SQL also self-creates them defensively).
Then **review** `backups/restore-old-manual-content.sql`, spot-check a few rows,
and run it in the Supabase SQL Editor. Items it could not map confidently
(products/catalog) are listed in `recovered-items-review.md` for manual mapping
into `catalog_products(source='manual')`.

## 7. Operational rule

> **Do not run catalog import / SEO / publish waves while booking health is
> failing.** Those jobs put heavy load on Supabase. Run the health probe first
> and only start import/publish work when `ok: true` and `bookingsRead` +
> `servicesRead` are both `true`.
