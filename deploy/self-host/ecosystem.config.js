// PM2 production process config for the self-hosted Ubuntu server (dachatv).
//
// No secrets live here. Runtime secrets (Supabase keys, CRON_SECRET, etc.)
// come from /var/www/dacha-tv/shared/.env.production, which the committed
// start-server.sh wrapper loads before starting Node — that file lives OUTSIDE the git repo and must be chmod 600
// (see deploy/self-host/README.md). This file only sets non-secret runtime
// knobs (NODE_ENV, HOSTNAME, PORT) that are safe to commit.
//
// Usage (on the server, from the `current` release symlink):
//   pm2 start deploy/self-host/ecosystem.config.js
//   pm2 reload dacha-tv     # zero-downtime reload after a new release
//   pm2 save                # persist across reboots (with pm2 startup)
module.exports = {
  apps: [
    {
      name: 'dacha-tv',
      cwd: '/var/www/dacha-tv/current',
      // .next/standalone's server.js — the traced, self-contained Next.js
      // server produced by `output: 'standalone'`. Not a custom server: this
      // is the exact entrypoint Next.js's own build generates.
      script: 'deploy/self-host/start-server.sh',
      interpreter: '/bin/bash',

      // Single process, no cluster — the target server has 2 CPU cores and
      // ~734 MiB currently available; a second worker would roughly double
      // memory pressure for marginal throughput gain on a catalog site that
      // is not CPU-bound. Scale to cluster mode later only after confirming
      // there is real memory headroom.
      exec_mode: 'fork',
      instances: 1,

      // Secrets are NOT set here — loaded from the shared env file at deploy
      // time (see deploy/self-host/install-release.sh).
      env: {
        NODE_ENV: 'production',
        HOSTNAME: '127.0.0.1', // never bind beyond localhost — Nginx proxies
        PORT: '3030',
      },

      // Crash/restart policy.
      autorestart: true,
      max_restarts: 10, // give up flapping-restart after this many in `min_uptime`
      min_uptime: '30s', // a restart before this counts toward max_restarts
      restart_delay: 4000, // ms — avoid a hot crash-loop hammering the box

      // Memory ceiling for a 3.7 GiB box with ~734 MiB currently free. A
      // single Next.js standalone process for this catalog typically runs a
      // few hundred MB RSS; 450M gives headroom above normal operation while
      // still protecting the rest of the box (Nginx, PM2 itself, OS) from a
      // leak ballooning until the OOM killer picks an arbitrary victim.
      // Revisit once real production RSS is observed.
      max_memory_restart: '450M',

      // Timestamps so `pm2 logs` / log files are useful without cross-
      // referencing PM2's internal event timing.
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // Graceful shutdown: Next.js's standalone server handles SIGINT/SIGTERM
      // itself (closes the HTTP server, lets in-flight requests finish) —
      // give it a real window before PM2 escalates to SIGKILL, and don't
      // treat "ready to accept traffic" as instant.
      kill_timeout: 8000,
      listen_timeout: 8000,
      shutdown_with_message: false,
    },
  ],
}
