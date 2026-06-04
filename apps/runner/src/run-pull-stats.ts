import "dotenv/config";
import { getEnv, validateEnv } from "@repo/config";
import { getSupabase } from "@repo/core";

validateEnv();

interface PublishedPostRow {
  id: string;
  platform: string;
  platform_post_id: string | null;
  status: string | null;
}

async function pullTikTokStats(posts: PublishedPostRow[]): Promise<number> {
  const env = getEnv();
  const tiktokPosts = posts.filter(
    (p) => p.platform === "tiktok" && p.platform_post_id,
  );
  let updated = 0;

  for (const post of tiktokPosts) {
    try {
      const response = await fetch(
        "https://open.tiktokapis.com/v2/video/query/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.TIKTOK_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            filters: { video_ids: [post.platform_post_id] },
            fields: [
              "view_count",
              "like_count",
              "comment_count",
              "share_count",
            ],
          }),
        },
      );

      if (!response.ok) continue;

      const data = (await response.json()) as {
        data?: {
          videos?: Array<{
            view_count?: number;
            like_count?: number;
            comment_count?: number;
            share_count?: number;
          }>;
        };
      };
      const video = data?.data?.videos?.[0];
      if (!video) continue;

      const { error } = await getSupabase()
        .from("published_posts")
        .update({
          views: video.view_count ?? 0,
          likes: video.like_count ?? 0,
          comments: video.comment_count ?? 0,
          shares: video.share_count ?? 0,
          last_stats_updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      if (!error) updated += 1;
    } catch (e) {
      console.warn(`Failed to pull TikTok stats for post ${post.id}:`, e);
    }
  }

  return updated;
}

async function pullInstagramStats(posts: PublishedPostRow[]): Promise<number> {
  const env = getEnv();
  const igPosts = posts.filter(
    (p) => p.platform.startsWith("instagram") && p.platform_post_id,
  );
  let updated = 0;

  for (const post of igPosts) {
    try {
      const response = await fetch(
        `https://graph.facebook.com/v19.0/${post.platform_post_id}/insights?metric=impressions,reach,likes,comments,shares,saved&access_token=${env.INSTAGRAM_ACCESS_TOKEN}`,
      );

      if (!response.ok) continue;

      const data = (await response.json()) as {
        data?: Array<{ name: string; values?: Array<{ value?: number }> }>;
      };
      const metrics: Record<string, number> = {};
      for (const m of data?.data ?? []) {
        metrics[m.name] = m.values?.[0]?.value ?? 0;
      }

      const { error } = await getSupabase()
        .from("published_posts")
        .update({
          views: metrics.impressions ?? 0,
          likes: metrics.likes ?? 0,
          comments: metrics.comments ?? 0,
          shares: metrics.shares ?? 0,
          saves: metrics.saved ?? 0,
          last_stats_updated_at: new Date().toISOString(),
        })
        .eq("id", post.id);

      if (!error) updated += 1;
    } catch (e) {
      console.warn(`Failed to pull IG stats for post ${post.id}:`, e);
    }
  }

  return updated;
}

async function main(): Promise<void> {
  console.log(`Pulling platform stats at ${new Date().toISOString()}`);

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentPosts, error } = await getSupabase()
    .from("published_posts")
    .select("id, platform, platform_post_id, status")
    .gte("published_at", sevenDaysAgo)
    .eq("status", "published");

  if (error) {
    throw new Error(`Failed to load published posts: ${error.message}`);
  }

  if (!recentPosts?.length) {
    console.log("No recent posts to update");
    process.exit(0);
  }

  const posts = recentPosts as PublishedPostRow[];
  const [tiktokUpdated, igUpdated] = await Promise.all([
    pullTikTokStats(posts),
    pullInstagramStats(posts),
  ]);

  console.log(
    `Stats pull complete. TikTok: ${tiktokUpdated}, Instagram: ${igUpdated} (${posts.length} posts checked).`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Stats pull failed:", err);
  process.exit(1);
});
