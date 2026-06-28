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

## 4. Operational rule

> **Do not run catalog import / SEO / publish waves while booking health is
> failing.** Those jobs put heavy load on Supabase. Run the health probe first
> and only start import/publish work when `ok: true` and `bookingsRead` +
> `servicesRead` are both `true`.
