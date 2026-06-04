/** Run: npx supabase gen types typescript --project-id YOUR_PROJECT_ID > packages/core/src/db/types.ts */

export type ContentQueueStatus =
  | "pending"
  | "generating"
  | "ready"
  | "publishing"
  | "published"
  | "failed";

export interface ContentQueueRow {
  id: string;
  type: string;
  status: ContentQueueStatus;
  niche: string;
  topic: string;
  keywords: string[];
  platform_targets: string[];
  source_url: string | null;
  metadata: Record<string, unknown>;
  error: string | null;
  retry_count: number;
  created_at: string;
  scheduled_at: string | null;
  published_at: string | null;
}
