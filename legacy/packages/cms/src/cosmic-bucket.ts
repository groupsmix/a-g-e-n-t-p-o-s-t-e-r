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

function createClient(bucketSlug: string): CosmicBucket {
  const env = getEnv();
  return createBucketClient({
    bucketSlug,
    readKey: env.COSMIC_READ_KEY,
    writeKey: env.COSMIC_WRITE_KEY,
  }) as unknown as CosmicBucket;
}

/** Default bucket from env (posteragent main CMS). */
export function getCosmic(): CosmicBucket {
  const env = getEnv();
  return getCosmicForBucket(env.COSMIC_BUCKET_SLUG);
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
