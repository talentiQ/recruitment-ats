/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',

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