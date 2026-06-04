/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@nexus/types'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787',
  },
}

module.exports = nextConfig
