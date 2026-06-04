import {
  getCosmic,
  getCosmicForBucket,
  type CosmicObjectPayload,
} from "./cosmic-bucket.js";
import type { ObjectTypeSlug } from "./content-types.js";

export interface CosmicObjectInput {
  type: ObjectTypeSlug | string;
  title: string;
  slug?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  status?: "draft" | "published";
  thumbnail?: string;
}

export interface CosmicObjectRecord {
  id: string;
  title: string;
  slug: string;
  type: string;
  metadata: Record<string, unknown>;
  status?: string;
}

function toRecord(object: CosmicObjectPayload): CosmicObjectRecord {
  return {
    id: object.id,
    title: object.title,
    slug: object.slug,
    type: object.type,
    metadata: object.metadata ?? {},
    status: object.status,
  };
}

export async function createCosmicObject(
  input: CosmicObjectInput,
  options?: { bucketSlug?: string },
): Promise<CosmicObjectRecord> {
  const cosmic = options?.bucketSlug
    ? getCosmicForBucket(options.bucketSlug)
    : getCosmic();
  const { object } = await cosmic.objects.insertOne({
    type: input.type,
    title: input.title,
    slug: input.slug,
    content: input.content,
    metadata: input.metadata,
    status: input.status ?? "draft",
    thumbnail: input.thumbnail,
  });

  return toRecord(object);
}

export async function getCosmicObject(
  id: string,
): Promise<CosmicObjectRecord | null> {
  const cosmic = getCosmic();
  const { object } = await cosmic.objects.findOne({ id });
  if (!object) return null;
  return toRecord(object);
}

export async function findCosmicObjects(params: {
  type: ObjectTypeSlug | string;
  status?: string;
  limit?: number;
  props?: string;
}): Promise<CosmicObjectRecord[]> {
  const cosmic = getCosmic();
  const query: Record<string, unknown> = { type: params.type };
  if (params.status) {
    query.status = params.status;
  }

  let chain = cosmic.objects.find(query);
  if (params.props) {
    chain = chain.props(params.props);
  }

  const { objects } = await chain.limit(params.limit ?? 25);
  return (objects ?? []).map(toRecord);
}

export async function updateCosmicObject(
  id: string,
  updates: {
    title?: string;
    slug?: string;
    content?: string;
    metadata?: Record<string, unknown>;
    status?: "draft" | "published";
    thumbnail?: string;
  },
): Promise<CosmicObjectRecord> {
  const cosmic = getCosmic();
  const { object } = await cosmic.objects.updateOne(id, updates);
  return toRecord(object);
}

export async function deleteCosmicObject(id: string): Promise<void> {
  const cosmic = getCosmic();
  await cosmic.objects.deleteOne(id);
}
