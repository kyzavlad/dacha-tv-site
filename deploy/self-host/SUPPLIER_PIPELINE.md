# Dacha TV self-host supplier pipeline

`run-supplier-pipeline.sh` is the canonical self-host runner for the daily Personal.cab → storefront refresh.

## Why one runner

The Personal.cab product and RRP feeds are larger than one safe HTTP request on the 3.7 GB server. Both application endpoints are deliberately bounded and persist a durable cursor. A scheduler that calls each endpoint only once can therefore leave the product tail stale for hours or days.

The runner keeps the endpoints bounded but repeatedly calls them until their explicit completion signal is persisted. It then advances in this order:

1. `sync-products` — full base price, stock and supplier product cycle.
2. `sync-categories` — reconcile categories after today's product feed has refreshed supplier category data.
3. `refresh-rrp` — full official Personal.cab retail/RRP cycle after base price is current.
4. `import-products` — drain supplier → catalog refresh until `done=true`.
5. `publish-products` — publish eligible drafts only after upstream product and retail price data is current.

This order preserves the pricing rule: the storefront may use an unlocked supplier price only when a validated official RRP exists and is not below the current supplier/base price.

## Safety properties

- Reads `CRON_SECRET` only from `/var/www/dacha-tv/shared/.env.production`.
- Never prints the secret value.
- Uses the internal app origin and authenticated cron endpoints; it does not call Personal.cab directly.
- Uses `flock` on `/var/www/dacha-tv/shared/supplier-pipeline.lock`; overlapping invocations exit cleanly.
- Requires `stateSaved=true` and `cycleComplete=true` before advancing from the resumable product/RRP stages.
- Every stage is bounded by a maximum number of HTTP calls.
- Catalog import must explicitly return `done=true` before publish runs.
- Health is checked before the first mutation and after the final stage.
- Category reconciliation is non-blocking because the endpoint isolates its own category sub-stages; base/RRP/import failures are blocking.

## Manual production run

After deploying a release that contains the runner:

```bash
bash /var/www/dacha-tv/current/deploy/self-host/run-supplier-pipeline.sh
```

A successful run ends with:

```text
[supplier-pipeline] ... supplier pipeline complete
```

## Scheduling

Use **one** scheduler for this runner. Do not keep the legacy independent `sync-products`, `import-products`, `publish-products`, or a separate RRP schedule active at the same time.

Before replacing the current scheduler, inspect the real server configuration and back it up. The active trigger may be a user/root crontab, a systemd timer, or an external n8n workflow; this repository intentionally does not guess which source currently owns production scheduling.

A cron entry, once the old trigger source is positively identified and removed, can invoke the runner with `bash` (the GitHub artifact does not rely on an executable file mode), for example:

```cron
0 3 * * * bash /var/www/dacha-tv/current/deploy/self-host/run-supplier-pipeline.sh >> /var/www/dacha-tv/shared/supplier-pipeline.log 2>&1
```

The example is 03:00 **server time**. Confirm the server timezone before installing it. The desired business rule is one daily run after the supplier's daily data is expected to be available, not a hard-coded timezone assumption.

## Failure recovery

Do not reset database cursors manually. Fix the upstream/server issue and run the same script again. `sync-products` and `refresh-rrp` resume from their persisted `supplier_sync_state` cursors; the import endpoint is idempotent and continues draining its queue.

If a previous invocation is still running, the new invocation exits without overlap because of the lock.
