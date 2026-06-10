import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getSupabase } from "@repo/core";

export const fetchGoogleTrendsTool = createTool({
  id: "fetch-google-trends",
  description:
    "Fetches trending search topics from Google Trends for a given niche and region",
  inputSchema: z.object({
    niche: z.string(),
    region: z.string().default("US"),
    timeframe: z
      .enum(["now 1-H", "now 4-H", "now 1-d", "now 7-d", "today 1-m"])
      .default("now 1-d"),
    limit: z.number().default(20),
  }),
  outputSchema: z.object({
    keywords: z.array(z.string()),
    topics: z.array(
      z.object({
        title: z.string(),
        traffic: z.string(),
        relatedQueries: z.array(z.string()),
      }),
    ),
  }),
  execute: async ({ niche, region, timeframe, limit }) => {
    // Audit #21: this used interestOverTime and mapped formattedValue —
    // a traffic *index* time series ("83", "100", ...) — as "keywords",
    // so downstream content generation ran on meaningless numbers.
    // relatedQueries gives actual search queries for the niche, and
    // dailyTrends gives real trending topics with traffic + related queries.
    const googleTrends = await import("google-trends-api");

    const timeframeToMs: Record<string, number> = {
      "now 1-H": 60 * 60 * 1000,
      "now 4-H": 4 * 60 * 60 * 1000,
      "now 1-d": 24 * 60 * 60 * 1000,
      "now 7-d": 7 * 24 * 60 * 60 * 1000,
      "today 1-m": 30 * 24 * 60 * 60 * 1000,
    };
    const startTime = new Date(
      Date.now() - (timeframeToMs[timeframe ?? "now 1-d"] ?? 24 * 60 * 60 * 1000),
    );
    const maxResults = limit ?? 20;

    let keywords: string[] = [];
    try {
      const relatedRaw = await googleTrends.relatedQueries({
        keyword: niche,
        geo: region,
        startTime,
      });
      const related = JSON.parse(relatedRaw) as {
        default?: {
          rankedList?: { rankedKeyword?: { query?: string }[] }[];
        };
      };
      keywords = (related.default?.rankedList ?? [])
        .flatMap((list) => list.rankedKeyword ?? [])
        .map((k) => k.query)
        .filter((q): q is string => Boolean(q))
        .slice(0, maxResults);
    } catch {
      // Fall through with empty keywords; topics below may still succeed.
    }

    let topics: { title: string; traffic: string; relatedQueries: string[] }[] =
      [];
    try {
      const dailyRaw = await googleTrends.dailyTrends({ geo: region });
      const daily = JSON.parse(dailyRaw) as {
        default?: {
          trendingSearchesDays?: {
            trendingSearches?: {
              title?: { query?: string };
              formattedTraffic?: string;
              relatedQueries?: { query?: string }[];
            }[];
          }[];
        };
      };
      topics = (
        daily.default?.trendingSearchesDays?.[0]?.trendingSearches ?? []
      )
        .map((t) => ({
          title: t.title?.query ?? "",
          traffic: t.formattedTraffic ?? "",
          relatedQueries: (t.relatedQueries ?? [])
            .map((q) => q.query)
            .filter((q): q is string => Boolean(q)),
        }))
        .filter((t) => t.title)
        .slice(0, maxResults);
    } catch {
      // Daily trends are best-effort.
    }

    return { keywords, topics };
  },
});

export const fetchTikTokTrendsTool = createTool({
  id: "fetch-tiktok-trends",
  description:
    "Scrapes TikTok trending hashtags for a niche using the Creative Center API",
  inputSchema: z.object({
    niche: z.string(),
    country: z.string().default("US"),
    limit: z.number().default(30),
  }),
  outputSchema: z.object({
    hashtags: z.array(
      z.object({
        name: z.string(),
        videoCount: z.number(),
        viewCount: z.number(),
      }),
    ),
    topics: z.array(z.string()),
  }),
  execute: async ({ niche, country, limit }) => {
    // Audit #22: `niche` was accepted but silently ignored — every niche got
    // the same generic top hashtags. The Creative Center list endpoint has no
    // keyword filter, so we over-fetch and filter by niche tokens, falling
    // back to the unfiltered top list when nothing matches.
    const maxResults = limit ?? 30;
    const pageSize = Math.min(Math.max(maxResults * 2, 50), 100);
    const url = `https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list?period=7&country_code=${country}&page_size=${pageSize}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!response.ok) {
      throw new Error(`TikTok trends request failed: HTTP ${response.status}`);
    }
    const data = (await response.json()) as {
      data?: {
        list?: {
          hashtag_name: string;
          video_views?: number;
          publish_cnt?: number;
        }[];
      };
    };
    const list = data?.data?.list ?? [];

    const nicheTokens = niche
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2);
    const matches = list.filter((item) =>
      nicheTokens.some((t) => item.hashtag_name?.toLowerCase().includes(t)),
    );

    const hashtags = (matches.length > 0 ? matches : list)
      .slice(0, maxResults)
      .map((item) => ({
        name: item.hashtag_name,
        // Audit #22 (bonus): videoCount used to duplicate video_views.
        videoCount: item.publish_cnt ?? 0,
        viewCount: item.video_views ?? 0,
      }));
    return { hashtags, topics: hashtags.map((h) => h.name) };
  },
});

export const fetchRedditTrendsTool = createTool({
  id: "fetch-reddit-trends",
  description: "Gets hot posts from a subreddit related to the niche for content ideas",
  inputSchema: z.object({
    subreddit: z.string(),
    limit: z.number().default(25),
    filter: z.enum(["hot", "top", "rising", "new"]).default("hot"),
    timeframe: z
      .enum(["hour", "day", "week", "month", "year", "all"])
      .default("day"),
  }),
  outputSchema: z.object({
    posts: z.array(
      z.object({
        title: z.string(),
        score: z.number(),
        commentCount: z.number(),
        url: z.string(),
        selftext: z.string(),
      }),
    ),
  }),
  execute: async ({ subreddit, limit, filter, timeframe }) => {
    const url = `https://www.reddit.com/r/${subreddit}/${filter}.json?limit=${limit}&t=${timeframe}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "ContentBot/1.0" },
    });
    const data = (await response.json()) as {
      data?: {
        children?: {
          data: {
            title: string;
            score: number;
            num_comments: number;
            permalink: string;
            selftext?: string;
          };
        }[];
      };
    };
    const posts =
      data?.data?.children?.map((child) => ({
        title: child.data.title,
        score: child.data.score,
        commentCount: child.data.num_comments,
        url: `https://reddit.com${child.data.permalink}`,
        selftext: child.data.selftext?.slice(0, 500) ?? "",
      })) ?? [];
    return { posts };
  },
});

export const saveTrendCacheTool = createTool({
  id: "save-trend-cache",
  description:
    "Saves trend data to the database cache to avoid repeated API calls",
  inputSchema: z.object({
    platform: z.string(),
    niche: z.string(),
    keywords: z.array(z.string()),
    hashtags: z.array(z.string()),
    topics: z.array(z.unknown()),
  }),
  outputSchema: z.object({ saved: z.boolean() }),
  execute: async ({ platform, niche, keywords, hashtags, topics }) => {
    const { error } = await getSupabase().from("trend_cache").insert({
      platform,
      niche,
      keywords,
      hashtags,
      topics,
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
    });
    return { saved: !error };
  },
});
