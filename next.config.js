/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',

  // Prevent Next.js from bundling these — must run as native Node modules
  serverExternalPackages: ['pdf-parse', 'mammoth'],

  typescript: {
    ignoreBuildErrors: true, // TODO: remove once TS errors are fixed
  },

  eslint: {
    ignoreDuringBuilds: true, // TODO: remove once ESLint errors are fixed
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
}

module.exports = nextConfig