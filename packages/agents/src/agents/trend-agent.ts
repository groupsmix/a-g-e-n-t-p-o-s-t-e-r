import { Agent } from "@mastra/core/agent";
import {
  fetchGoogleTrendsTool,
  fetchTikTokTrendsTool,
  fetchRedditTrendsTool,
  saveTrendCacheTool,
} from "@repo/tools";

export const trendAgent = new Agent({
  id: "trend-research-agent",
  name: "TrendResearchAgent",
  instructions: `You are a trend research specialist for content marketing.
Your job is to find the most viral, high-engagement topics for a given niche.
Always fetch from multiple sources: Google Trends, TikTok Trends, and Reddit.
Filter for topics that: (1) have search volume, (2) are visual/emotional, (3) work well as short video or poster content.
Return topics sorted by virality potential descending.
For each topic, suggest a content angle: "did you know", "how to", "vs comparison", "reaction", "story", "listicle".
ALWAYS save results to trend cache after fetching.`,
  model: "anthropic/claude-sonnet-4-5",
  tools: {
    fetchGoogleTrends: fetchGoogleTrendsTool,
    fetchTikTokTrends: fetchTikTokTrendsTool,
    fetchRedditTrends: fetchRedditTrendsTool,
    saveTrendCache: saveTrendCacheTool,
  },
});
