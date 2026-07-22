# Self-hosting Dacha TV on the `dachatv` Ubuntu server (Phase 1)

Moves the app from paused Vercel hosting to our own Ubuntu 22.04 x86_64
server, running as a PM2-managed Node process on `127.0.0.1:3030`, behind
Nginx, with Supabase remaining external and unchanged. n8n stays on its own
separate server.

This document is the safe, ordered flow. **Nothing in this repository
deploys, enables Nginx, or switches DNS automatically** — every step below is
manual and reviewed before the next one.

Server facts this plan is built for: 2 CPU cores, 3.7 GiB RAM (~734 MiB
available at last check), 4 GiB swap, 16 GiB free disk, Node.js 20.20.0,
PM2 6.0.14, Nginx already active, production domain `dachatv.com`.

---

## 0. Layout on the server

```
/var/www/dacha-tv/
  releases/
    <release-id>/         one per deployed build (server.js at the top level)
  shared/
    .env.production        OUTSIDE git, chmod 600 — see step 4
  current -> releases/<release-id>   atomic symlink, switched by switch-release.sh
```

`current` is what PM2's `ecosystem.config.js` (`cwd`) and Nginx (indirectly,
via the running process on port 3030) actually run.

---

## 1. Produce the Linux artifact

From the repository, on GitHub:

1. Go to **Actions → Build standalone Linux artifact → Run workflow**
   (`workflow_dispatch` only — this never runs on push or PR).
2. Pick the branch/tag to build (e.g. `fix/set-based-catalog-refresh-v6`, or
   `main` once merged).
3. Wait for the job. It runs `pnpm tsc --noEmit`, `pnpm typecheck:scripts`,
   `pnpm test`, `pnpm exec eslint .`, then `pnpm build`, assembles
   `.next/standalone` (with `public/` and `.next/static` copied in — Next.js
   does not do this by itself), writes a `BUILD_MANIFEST.txt` (git SHA, build
   date, Node/pnpm version — no secrets), and verifies no `.env*` file ended
   up in the release before packaging.

No `.env` file is read or required during this build — every route in this
app is dynamically rendered or degrades gracefully when Supabase is
unreachable at build time (see `app/sitemap.ts`), so this is a real,
previously-validated build, not a stub.

## 2. Download the artifact

From the finished workflow run, download the `dacha-tv-standalone-linux-x64`
artifact (a `.tar.gz`). It contains one top-level `standalone/` directory:
`server.js`, `.next/` (including `.next/static/`), `public/`,
`BUILD_MANIFEST.txt`, and this repo's `deploy/` directory (so
`ecosystem.config.js` travels with the release).

## 3. Upload to the server

Copy the archive to the server with whatever transfer method your operator
access uses (this repo does not script server access). A reasonable target
is a scratch path, e.g. `/tmp/dacha-tv-standalone-linux-x64.tar.gz` — the
install script below reads it from wherever you put it.

## 4. Create the protected env file

**Do this once, and whenever a secret rotates.** Outside the git repo:

```
sudo install -d -m 700 /var/www/dacha-tv/shared
sudo touch /var/www/dacha-tv/shared/.env.production
sudo chmod 600 /var/www/dacha-tv/shared/.env.production
sudo $EDITOR /var/www/dacha-tv/shared/.env.production
```

Use `pnpm env:inventory /var/www/dacha-tv/shared/.env.production` (from a
checked-out copy of this repo, e.g. inside a release directory) to see which
variable **names** the app expects and which of those names are missing from
the file — it reads and reports NAMES only, never values, and never modifies
the file. Cross-check the "optional" bucket by hand; the classification is a
heuristic, not a guarantee.

`install-release.sh` and `switch-release.sh` both refuse to run if this file
is missing or not `chmod 600` — deploying without a reviewed, private env
file is not allowed.

### `INTERNAL_APP_ORIGIN` — required for `/ru/*` and `/en/*` routes to work behind TLS termination

Set this in `/var/www/dacha-tv/shared/.env.production`:

```
INTERNAL_APP_ORIGIN=http://127.0.0.1:3030
```

**Why it's required here (and not on Vercel or in local dev):** `proxy.ts`
rewrites `/ru/*`/`/en/*` requests to their canonical (unprefixed) path via
`NextResponse.rewrite(absoluteUrl, ...)`. When that absolute URL points at a
different origin than the one actually serving the request, Next.js performs
a real internal HTTP fetch to it. Behind Nginx (which terminates TLS and
forwards `X-Forwarded-Proto: https`), `request.nextUrl` reconstructs an
`https://` origin — but the standalone Node server behind it only ever speaks
plain HTTP on `127.0.0.1:3030`. Rewriting to that HTTPS-but-actually-HTTP
origin makes Next.js's internal fetch attempt a TLS handshake against a
plain-HTTP port, which fails with a "wrong version number" TLS error — this
was the production 500 on every `/ru/*` and `/en/*` route. `INTERNAL_APP_ORIGIN`
tells `proxy.ts` to target the known-good internal origin instead of trusting
the externally-visible one it would otherwise reconstruct. See
`lib/locale-rewrite.ts` for the implementation and `tests/proxy-locale-rewrite.test.mjs`
/ `tests/locale-rewrite.test.mjs` for the test coverage.

This variable is **server-only** — it is never prefixed `NEXT_PUBLIC_`, so
Next.js never inlines it into any client bundle, and it is only ever read
inside `proxy.ts` (middleware, never sent to the browser). When it is unset,
`proxy.ts` falls back to its previous behavior (rewriting against
`request.nextUrl`'s own origin) — this is what keeps Vercel and
`next dev` working unchanged; only the self-hosted deployment needs to set it.

### `ADMIN_SESSION_SECRET` — required for `/admin/*` and `/api/admin/*` auth

Set this in `/var/www/dacha-tv/shared/.env.production` alongside `ADMIN_PASSWORD`:

```
ADMIN_SESSION_SECRET=<a long random value, e.g. output of `openssl rand -base64 48`>
```

This is the HMAC signing key for the admin session cookie (`lib/admin-session.ts`),
which replaced the old fixed `admin_session=1` cookie value. It is **server-only**
(never prefixed `NEXT_PUBLIC_`) and is read only at request time — inside
`proxy.ts` (Edge) and the admin login/logout route handlers/Server Actions
(Node) — never at build time, so it is not required in the GitHub Actions
build workflow, only in the runtime `.env.production` on the server.

**Rotating it immediately invalidates every previously issued admin session**
(every logged-in admin is forced back to `/admin/login`) without touching
`ADMIN_PASSWORD`. Rotate it if a session cookie may have leaked, or as routine
hygiene; it does not need to change in lockstep with `ADMIN_PASSWORD`.

## 5. Deploy to port 3030

```
cd /var/www/dacha-tv   # or wherever you keep a checkout of deploy/self-host/
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)"
./deploy/self-host/deploy.sh /tmp/dacha-tv-standalone-linux-x64.tar.gz "$RELEASE_ID"
```

`deploy.sh` runs `install-release.sh` (extract, verify required files,
refuse if the env file is missing/insecure) then `switch-release.sh`
(atomically flip the `current` symlink, `pm2 reload`/`pm2 start`, health-check
`http://127.0.0.1:3030/api/health` with retries, and **automatically roll
back** to the previous release if the health check fails). It prunes old
releases afterward, keeping the newest 3 and never deleting whatever
`current` points to.

If you'd rather run the two steps separately (e.g. to inspect the release
before going live):

```
./deploy/self-host/install-release.sh /tmp/dacha-tv-standalone-linux-x64.tar.gz "$RELEASE_ID"
./deploy/self-host/switch-release.sh "$RELEASE_ID"
```

None of these scripts ever print an environment variable's value.

## 6. Test locally through SSH

Before touching Nginx or DNS, confirm the app itself is healthy from the
server's own shell:

```
curl -i http://127.0.0.1:3030/api/health
pm2 status dacha-tv
pm2 logs dacha-tv --lines 100
```

`/api/health` is public/unauthenticated on purpose (PM2/Nginx/uptime
monitors don't carry `CRON_SECRET`) — it never returns a secret value, does a
single tiny bounded Supabase read, and returns a real non-200 status when the
backend is unreachable or unconfigured, so a `200` here is meaningful.

Also confirm the locale-prefixed routes work — the specific failure
`INTERNAL_APP_ORIGIN` fixes (see step 4) is a 500 on exactly these, so a real
`200` here is the actual regression test, reproducing the production
TLS-termination topology with `Host`/`X-Forwarded-Proto` headers even though
you're hitting `127.0.0.1:3030` directly (no Nginx involved yet):

```
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Host: dachatv.com" -H "X-Forwarded-Proto: https" \
  http://127.0.0.1:3030/ru/services
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "Host: dachatv.com" -H "X-Forwarded-Proto: https" \
  http://127.0.0.1:3030/en/beekeeper
```

Both must print `200`, not `500`.

## 7. Test through a temporary hostname or local hosts override

Before DNS points at this server, verify the app renders correctly through a
browser by pointing your OWN machine's `/etc/hosts` (not the server's, and
not real DNS) at the server's IP for `dachatv.com` / `www.dachatv.com`, e.g.:

```
# on your workstation, NOT the server
203.0.113.10  dachatv.com www.dachatv.com
```

then browse `http://dachatv.com/` once Nginx (step 8) is enabled. Remove the
hosts entry when done testing. This lets you validate the full Nginx → app
path with the real hostname (headers, `next/image` behavior, cookies scoped
to the domain) without touching production DNS.

## 8. Enable Nginx

Only after steps 6–7 pass:

```
sudo cp deploy/self-host/nginx/dachatv.com.conf /etc/nginx/sites-available/dachatv.com.conf
sudo ln -s /etc/nginx/sites-available/dachatv.com.conf /etc/nginx/sites-enabled/
sudo nginx -t      # MUST pass — do not reload if it doesn't
sudo systemctl reload nginx
```

The template proxies `dachatv.com`/`www.dachatv.com` to `127.0.0.1:3030`
only (port 3030 itself is never exposed publicly — the app already binds
`127.0.0.1` regardless of Nginx). It preserves `Host`/client-IP headers,
forwards `Accept` for `next/image`, streams responses (`proxy_buffering
off` on the main location), sets long immutable caching only for
`/_next/static/`, applies no caching to HTML/API/admin/checkout, allows the
100 MB Server Action upload ceiling, and gives the bounded admin
catalog/SEO/import endpoints a longer (180s) timeout than ordinary traffic
(60s). It is **HTTP-only** — no certificate paths are referenced, because no
certificate exists yet. Get one with `certbot --nginx -d dachatv.com -d
www.dachatv.com` after this HTTP config is verified working; certbot rewrites
the file to add the 443 block itself.

## 9. Switch DNS only after validation

Only once steps 6–8 are all confirmed working: update the `dachatv.com` /
`www.dachatv.com` DNS records to point at the server's IP. This repository
never modifies DNS — that is a manual, external step taken only when you are
ready, at your registrar/DNS provider.

## 10. Rollback procedure

Automatic: `switch-release.sh` already rolls back to the previous release by
itself if the post-deploy health check fails, and exits non-zero so any
calling automation knows the deploy did not actually succeed.

Manual (e.g. a bug is found after a deploy that DID pass its health check):

```
./deploy/self-host/rollback.sh              # rolls back to the release before the current one
./deploy/self-host/rollback.sh <release-id> # roll back to a specific, still-installed release
```

Both paths reuse `switch-release.sh`'s same atomic-symlink-swap +
health-check logic — a rollback is just a switch to an older, known-good
release directory. Releases are never deleted while active or immediately
previous; the newest 3 are always kept on disk.

---

## Vercel Cron jobs needing an external replacement

`vercel.json` (still in the repo) currently schedules exactly these 4 jobs.
None of them have a replacement configured by this repo — self-hosting on
`dachatv` means Vercel Cron no longer fires them at all, so they need either
an n8n workflow (on its own separate server) or a system `cron`/systemd timer
on `dachatv` calling the same authenticated endpoints with `CRON_SECRET`.
**Nothing here activates or duplicates any of them** — this is an inventory
to act on deliberately, not an automatic migration.

| Endpoint | Schedule in `vercel.json` | Purpose |
| --- | --- | --- |
| `GET /api/admin/cron/sync-categories` | `0 1 * * *` (01:00 UTC) | Supplier → `catalog_categories` sync |
| `GET /api/admin/cron/sync-products` | `0 3 * * *` (03:00 UTC) | Supplier API → `supplier_products` |
| `GET /api/admin/cron/import-products` | `0 4 * * *` (04:00 UTC) | `supplier_products` → `catalog_products` — this is the set-based-refresh endpoint fixed in `fix/set-based-catalog-refresh-v6`; call repeatedly until `remaining` is 0 |
| `GET /api/admin/cron/publish-products` | `0 5 * * *` (05:00 UTC) | Publish draft products (respects the published cap) |

Every one of these requires `Authorization: Bearer $CRON_SECRET` (see
`app/api/admin/cron/_auth.ts`) — whatever replaces Vercel Cron (n8n HTTP
Request node, or `curl` in a system cron entry) must send that header. Do not
lower or remove that authentication requirement when migrating the trigger
mechanism.

### Other cron-shaped admin endpoints that exist but are NOT in `vercel.json`

`app/api/admin/cron/` also contains `category-seo`, `import-category-seo-sheet`,
`import-product-seo-sheet`, `product-seo`, `product-seo-template`,
`import-seo-priority`, and `refresh-prices`. These are not currently scheduled
by Vercel Cron at all (verify against `vercel.json` and
`lib/catalog/automation-config.ts`'s `CRON_STEPS` before assuming otherwise —
`CRON_STEPS` documents an *intended* 6-step daily order including
`category_seo`/`product_seo`, but only the 4 steps above are actually wired
into `vercel.json`). Treat them as manually-triggered admin operations unless
and until someone deliberately schedules them too.

---

## What this repo does NOT do (by design)

- Does not SSH into or otherwise access the server.
- Does not modify DNS.
- Does not push, merge, or deploy on its own.
- Does not touch production data.
- Does not change v6 catalog-refresh, SEO, advertising, checkout, order, or
  translation behavior.
- Does not print or commit secrets — `deploy/self-host/*.sh` never echo an
  environment value, and `scripts/env-inventory.ts` compares variable NAMES
  only.
- Does not enable the Nginx template or activate/duplicate any cron job
  automatically.
