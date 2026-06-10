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
  execute: async ({ niche, region, limit }) => {
    // Audit #21: this used to call interestOverTime() and return
    // timelineData.formattedValue — which is the *traffic index* of the
    // niche keyword over time (strings like "73"), not keywords. Use
    // relatedQueries() for actual search terms around the niche, and
    // dailyTrends() for trending topics with their traffic + context.
    const googleTrends = await import("google-trends-api");

    const [relatedRaw, dailyRaw] = await Promise.allSettled([
      googleTrends.relatedQueries({ keyword: niche, geo: region }),
      googleTrends.dailyTrends({ geo: region }),
    ]);

    const keywords: string[] = [];
    if (relatedRaw.status === "fulfilled") {
      const parsed = JSON.parse(relatedRaw.value) as {
        default?: {
          rankedList?: { rankedKeyword?: { query?: string }[] }[];
        };
      };
      for (const list of parsed.default?.rankedList ?? []) {
        for (const item of list.rankedKeyword ?? []) {
          if (item.query && !keywords.includes(item.query)) {
            keywords.push(item.query);
          }
        }
      }
    }

    const topics: {
      title: string;
      traffic: string;
      relatedQueries: string[];
    }[] = [];
    if (dailyRaw.status === "fulfilled") {
      const parsed = JSON.parse(dailyRaw.value) as {
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
      for (const day of parsed.default?.trendingSearchesDays ?? []) {
        for (const search of day.trendingSearches ?? []) {
          if (!search.title?.query) continue;
          topics.push({
            title: search.title.query,
            traffic: search.formattedTraffic ?? "",
            relatedQueries: (search.relatedQueries ?? [])
              .map((q) => q.query ?? "")
              .filter(Boolean),
          });
        }
      }
    }

    return {
      keywords: keywords.slice(0, limit),
      topics: topics.slice(0, limit),
    };
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
    // Audit #22: `niche` was accepted in the schema but never used — every
    // niche got the same generic country-wide hashtag list. The Creative
    // Center endpoint has no keyword filter, so fetch a larger window and
    // rank niche-relevant hashtags first (substring match on niche tokens),
    // falling back to the generic list when nothing matches.
    const maxResults = limit ?? 30;
    const countryCode = country ?? "US";
    const pageSize = Math.min(Math.max(maxResults * 4, 50), 100);
    const url = `https://ads.tiktok.com/creative_radar_api/v1/popular_trend/hashtag/list?period=7&country_code=${encodeURIComponent(countryCode)}&page_size=${pageSize}`;
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
    const all =
      data?.data?.list?.map((item) => ({
        name: item.hashtag_name,
        videoCount: item.video_views,
        viewCount: item.video_views,
      })) ?? [];

    const tokens = niche
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2);
    const matchesNiche = (name: string) => {
      const lower = name.toLowerCase();
      return tokens.some((t) => lower.includes(t));
    };

    const relevant = all.filter((h) => matchesNiche(h.name));
    const rest = all.filter((h) => !matchesNiche(h.name));
    const hashtags = [...relevant, ...rest].slice(0, maxResults);

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
