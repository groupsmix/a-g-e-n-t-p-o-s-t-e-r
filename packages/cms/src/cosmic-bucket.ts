import { createBucketClient } from "@cosmicjs/sdk";
import { getEnv } from "@repo/config";

export interface CosmicObjectPayload {
  id: string;
  title: string;
  slug: string;
  type: string;
  metadata?: Record<string, unknown>;
  status?: string;
}

export interface CosmicFindChain {
  props(props: string | string[]): CosmicFindChain;
  limit(limit: number): Promise<{ objects?: CosmicObjectPayload[] }>;
}

/** Minimal Cosmic bucket surface used by @repo/cms. */
export interface CosmicBucket {
  objects: {
    find(query: Record<string, unknown>): CosmicFindChain;
    findOne(
      query: Record<string, unknown>,
    ): Promise<{ object?: CosmicObjectPayload }>;
    insertOne(
      data: Record<string, unknown>,
    ): Promise<{ object: CosmicObjectPayload }>;
    updateOne(
      id: string,
      updates: Record<string, unknown>,
    ): Promise<{ object: CosmicObjectPayload }>;
    deleteOne(id: string): Promise<unknown>;
  };
  media: {
    insertOne(params: {
      media: { buffer: Buffer; originalname: string; type?: string };
      folder?: string;
    }): Promise<{
      media?: {
        id?: string;
        url?: string;
        imgix_url?: string;
        name?: string;
        original_name?: string;
      };
    }>;
  };
  ai: {
    generateVideo(options: {
      prompt: string;
      duration?: 4 | 6 | 8;
      resolution?: "720p" | "1080p";
      reference_images?: string[];
      folder?: string;
    }): Promise<{
      media: {
        id: string;
        url: string;
        imgix_url: string;
        metadata?: { duration?: number };
      };
    }>;
  };
}

const bucketClients = new Map<string, CosmicBucket>();

/**
 * Pull a required Cosmic key out of env, throwing a clear error if it's
 * missing. The env schema marks these keys optional (the live Cloudflare
 * stack doesn't need them), so we re-assert the requirement here at the
 * boundary where they're actually used.
 */
function requireCosmicKey(key: 'COSMIC_BUCKET_SLUG' | 'COSMIC_READ_KEY' | 'COSMIC_WRITE_KEY'): string {
  const env = getEnv();
  const value = env[key];
  if (!value) {
    throw new Error(
      `[@repo/cms] ${key} is required to use the Cosmic client. Set it in your .env or skip the Cosmic-backed paths.`,
    );
  }
  return value;
}

function createClient(bucketSlug: string): CosmicBucket {
  return createBucketClient({
    bucketSlug,
    readKey: requireCosmicKey('COSMIC_READ_KEY'),
    writeKey: requireCosmicKey('COSMIC_WRITE_KEY'),
  }) as unknown as CosmicBucket;
}

/** Default bucket from env (posteragent main CMS). */
export function getCosmic(): CosmicBucket {
  return getCosmicForBucket(requireCosmicKey('COSMIC_BUCKET_SLUG'));
}

/** Per-site Cosmic bucket (same workspace keys, different slug). */
export function getCosmicForBucket(bucketSlug: string): CosmicBucket {
  let client = bucketClients.get(bucketSlug);
  if (!client) {
    client = createClient(bucketSlug);
    bucketClients.set(bucketSlug, client);
  }
  return client;
}
