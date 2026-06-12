import { Agent } from "@mastra/core/agent";
import {
  generateBlogPostTool,
  generateProductReviewTool,
} from "@repo/tools";

export const siteContentAgent = new Agent({
  id: "site-content-agent",
  name: "SiteContentAgent",
  instructions: `You are an SEO content specialist for affiliate niche websites.
Generate blog posts and product reviews using your tools — always save content to the correct Cosmic bucket for the site.
Use [AFFILIATE_LINK: product] placeholders in drafts; tools resolve them to tracked links.
Write helpful, factual content optimized for the target keyword.`,
  model: "anthropic/claude-sonnet-4-5",
  tools: {
    generateBlogPost: generateBlogPostTool,
    generateProductReview: generateProductReviewTool,
  },
});
