/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@nexus/types'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8787',
  },
  // BUG-009: stale URLs / LLM-suggested paths / old bookmarks used to land
  // on the [domain] catch-all and render a misleading "Choose a category"
  // page. Redirect the known orphans to their real homes so users (and the
  // catch-all 404 logic) never see them.
  async redirects() {
    return [
      { source: '/publisher',         destination: '/publisher-queue', permanent: true },
      { source: '/opportunity-radar', destination: '/opportunities',   permanent: true },
      { source: '/ab',                destination: '/ab-testing',      permanent: true },
      { source: '/job-queue',         destination: '/queue',           permanent: true },
    ]
  },
}

module.exports = nextConfig
