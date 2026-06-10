import { z } from "zod";

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  COSMIC_BUCKET_SLUG: z.string().min(1),
  COSMIC_READ_KEY: z.string().min(1),
  COSMIC_WRITE_KEY: z.string().min(1),
  ELEVENLABS_API_KEY: z.string().min(1),
  ELEVENLABS_VOICE_ID: z.string().default("21m00Tcm4TlvDq8ikWAM"),
  REPLICATE_API_TOKEN: z.string().min(1),
  FAL_API_KEY: z.string().optional(),
  TIKTOK_ACCESS_TOKEN: z.string().min(1),
  TIKTOK_CLIENT_KEY: z.string().min(1),
  TIKTOK_CLIENT_SECRET: z.string().min(1),
  INSTAGRAM_ACCESS_TOKEN: z.string().min(1),
  INSTAGRAM_BUSINESS_ACCOUNT_ID: z.string().min(1),
  FACEBOOK_PAGE_ID: z.string().min(1),
  YOUTUBE_CLIENT_ID: z.string().min(1),
  YOUTUBE_CLIENT_SECRET: z.string().min(1),
  YOUTUBE_REFRESH_TOKEN: z.string().min(1),
  TWITTER_API_KEY: z.string().min(1),
  TWITTER_API_SECRET: z.string().min(1),
  TWITTER_ACCESS_TOKEN: z.string().min(1),
  TWITTER_ACCESS_SECRET: z.string().min(1),
  PINTEREST_ACCESS_TOKEN: z.string().optional(),
  LINKEDIN_ACCESS_TOKEN: z.string().optional(),
  AMAZON_ASSOCIATE_TAG: z.string().min(1),
  AMAZON_ACCESS_KEY: z.string().min(1),
  AMAZON_SECRET_KEY: z.string().min(1),
  GUMROAD_ACCESS_TOKEN: z.string().optional(),
  GOOGLE_ANALYTICS_ID: z.string().optional(),
  VERCEL_TOKEN: z.string().min(1),
  VERCEL_ORG_ID: z.string().min(1),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  REDIS_URL: z.string().url().optional(),

  /** Postgres connection for Mastra storage (Supabase → Project Settings → Database) */
  DATABASE_URL: z.string().url().optional(),

  /** LibSQL / SQLite URL for local Mastra storage when DATABASE_URL is unset */
  MASTRA_STORAGE_URL: z.string().default("file:.mastra/storage.db"),

  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

/** All keys the schema knows about — used by check-env to detect
 *  .env.example drift (audit #8). */
export const envSchemaKeys = Object.keys(envSchema.shape);

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

/**
 * Non-fatal variant of validateEnv: returns success/failure as a result
 * instead of calling process.exit(1). Used by scripts/check-env.ts so a
 * clean clone of the repo (e.g. someone who only wants to work on the
 * Cloudflare stack in apps/nexus/) can boot without the legacy @repo/*
 * secrets configured.
 */
export function tryValidateEnv():
  | { ok: true; env: Env }
  | { ok: false; fieldErrors: Record<string, string[] | undefined> } {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    return { ok: false, fieldErrors: result.error.flatten().fieldErrors };
  }
  return { ok: true, env: result.data };
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
