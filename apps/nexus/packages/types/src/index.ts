// Domain Types
export * from './domain'

// Product Types
export * from './product'

// Workflow Types
export * from './workflow'

// AI Types
export * from './ai'

// Platform Types
export * from './platform'

// Action Types (CEO live assistant)
export * from './action'

// Portfolio Types (Money Machine)
export * from './portfolio'

// NOTE: The Env interface for Cloudflare bindings lives inside each Worker app
// (apps/nexus-api/src/env.ts, apps/nexus-ai/src/index.ts) because the set of
// bindings varies per worker and depends on @cloudflare/workers-types, which
// is a worker-only dependency. Keep shared type exports in this package
// platform-agnostic.
