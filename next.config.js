/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  
  // Fix for Vercel builds
  typescript: {
    ignoreBuildErrors: false, // 🔥 CHANGED: Let's see real errors
  },
  
  eslint: {
    ignoreDuringBuilds: true, // Keep this for now
  },

  // Image optimization
  images: {
    domains: [],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },

  // 🔥 ADD: Handle dynamic routes properly
  experimental: {
    serverActions: true,
  },
}

module.exports = nextConfig