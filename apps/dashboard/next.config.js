/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@posteragent/types'],
  experimental: {
    typedRoutes: false,
  },
}

module.exports = nextConfig
