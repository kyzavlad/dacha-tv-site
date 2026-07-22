import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Self-hosting (Phase 1, Ubuntu server + PM2 + Nginx): produces
  // .next/standalone/server.js, a self-contained Node server with only the
  // traced production dependencies — no `next start`, no custom server file.
  // public/ and .next/static are copied alongside it by the build workflow
  // (see .github/workflows/build-standalone-linux.yml) because standalone
  // output does not include either by default. Unrelated to and does not
  // change any Vercel behavior if this repo is ever deployed there again.
  output: 'standalone',
  experimental: {
    serverActions: {
      bodySizeLimit: '100mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
      {
        // Personal.cab supplier product images (e.g. https://images.zone/images/n-1171.jpg).
        // Exact host only — no wildcard — confirmed from get_products mainimage field.
        protocol: 'https',
        hostname: 'images.zone',
      },
    ],
    // How long an optimized image response may be cached/reused before
    // next/image re-validates it. A supplier product's image URL is stable
    // for the lifetime of that image (the daily sync writes a NEW url when a
    // supplier swaps a photo, it doesn't silently mutate content behind the
    // same URL), so this mainly trades "server CPU spent re-optimizing" for
    // "how soon a manual admin image swap on the SAME url shows up" — not a
    // hard invalidation wall. 24h is a sensible default for a 2-core box:
    // long enough to avoid re-processing the same image on every request,
    // short enough that a manual re-upload is visible the same day. Lower it
    // per-deploy (or bust via a new URL/query string) if faster propagation
    // is ever needed for a specific release.
    minimumCacheTTL: 60 * 60 * 24,
  },
}

export default nextConfig
