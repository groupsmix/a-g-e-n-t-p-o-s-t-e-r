import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Env schema — this package is consumed ONLY by the legacy @repo/* apps
// (apps/factory, apps/runner). The live NEXUS stack under apps/nexus/ never
// imports this. Production architecture is Cloudflare D1 + Pages + Workers, so
// Supabase / Vercel / Redis are no longer required to boot. Every key is
// declared optional below; individual consumers must `.parse()` a narrower
// schema if they actually need a given key.
//
// Rationale: keeping these as `.min(1)` made `pnpm check-env` (a `dependsOn`
// of `pnpm dev`) exit 1 on a clean clone before the dev even saw the
// dashboard, which contradicts the Cloudflare-only design noted in
// docs/FIXES-2026-06-05.md.
// ─────────────────────────────────────────────────────────────────────────────
const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  COSMIC_BUCKET_SLUG: z.string().min(1).optional(),
  COSMIC_READ_KEY: z.string().min(1).optional(),
  COSMIC_WRITE_KEY: z.string().min(1).optional(),
  ELEVENLABS_API_KEY: z.string().min(1).optional(),
  ELEVENLABS_VOICE_ID: z.string().default("21m00Tcm4TlvDq8ikWAM"),
  REPLICATE_API_TOKEN: z.string().min(1).optional(),
  FAL_API_KEY: z.string().optional(),
  TIKTOK_ACCESS_TOKEN: z.string().min(1).optional(),
  TIKTOK_CLIENT_KEY: z.string().min(1).optional(),
  TIKTOK_CLIENT_SECRET: z.string().min(1).optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().min(1).optional(),
  INSTAGRAM_BUSINESS_ACCOUNT_ID: z.string().min(1).optional(),
  FACEBOOK_PAGE_ID: z.string().min(1).optional(),
  YOUTUBE_CLIENT_ID: z.string().min(1).optional(),
  YOUTUBE_CLIENT_SECRET: z.string().min(1).optional(),
  YOUTUBE_REFRESH_TOKEN: z.string().min(1).optional(),
  TWITTER_API_KEY: z.string().min(1).optional(),
  TWITTER_API_SECRET: z.string().min(1).optional(),
  TWITTER_ACCESS_TOKEN: z.string().min(1).optional(),
  TWITTER_ACCESS_SECRET: z.string().min(1).optional(),
  PINTEREST_ACCESS_TOKEN: z.string().optional(),
  LINKEDIN_ACCESS_TOKEN: z.string().optional(),
  AMAZON_ASSOCIATE_TAG: z.string().min(1).optional(),
  AMAZON_ACCESS_KEY: z.string().min(1).optional(),
  AMAZON_SECRET_KEY: z.string().min(1).optional(),
  GUMROAD_ACCESS_TOKEN: z.string().optional(),
  GOOGLE_ANALYTICS_ID: z.string().optional(),
  // Vercel / Supabase / Redis are remnants of the pre-Cloudflare design.
  // Kept optional so legacy code still type-checks; not required to boot.
  VERCEL_TOKEN: z.string().min(1).optional(),
  VERCEL_ORG_ID: z.string().min(1).optional(),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().min(1).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  REDIS_URL: z.string().url().optional(),

  /** Postgres connection for Mastra storage (Supabase → Project Settings → Database) */
  DATABASE_URL: z.string().url().optional(),

  /** LibSQL / SQLite URL for local Mastra storage when DATABASE_URL is unset */
  MASTRA_STORAGE_URL: z.string().default("file:.mastra/storage.db"),

  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function validateEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  return result.data;
}

/** Validated env — loaded on first access (safe for `tsc` without a `.env`). */
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv();
  }
  return cachedEnv;
}

export const env = new Proxy({} as Env, {
  get(_target, prop: string | symbol) {
    if (typeof prop === "symbol") return undefined;
    return getEnv()[prop as keyof Env];
  },
});
