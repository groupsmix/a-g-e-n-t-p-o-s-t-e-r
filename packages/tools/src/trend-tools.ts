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
  execute: async ({ niche, region }) => {
    const googleTrends = await import("google-trends-api");
    const results = await googleTrends.interestOverTime({
      keyword: niche,
      geo: region,
      startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    const parsed = JSON.parse(results) as {
      default?: { timelineData?: { formattedValue: string[] }[] };
    };
    const keywords =
      parsed.default?.timelineData
        ?.map((d) => d.formattedValue[0])
        .filter(Boolean)
        .slice(0, 20) ?? [];
    return { keywords, topics: [] };
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
  execute: async ({ country, limit }) => {
    const url = `https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list?period=7&country_code=${country}&page_size=${limit}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    const data = (await response.json()) as {
      data?: {
        list?: {
          hashtag_name: string;
          video_views: number;
        }[];
      };
    };
    const hashtags =
      data?.data?.list?.map((item) => ({
        name: item.hashtag_name,
        videoCount: item.video_views,
        viewCount: item.video_views,
      })) ?? [];
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
