import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
  },
}

export default nextConfig
