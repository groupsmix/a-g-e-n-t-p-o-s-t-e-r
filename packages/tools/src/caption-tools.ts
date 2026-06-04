import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { generateText } from "ai";

const platformRules = {
  tiktok:
    "Keep under 150 chars. Hook in first 3 words. Use 3-5 trending hashtags. Add call to action.",
  instagram_feed:
    "Up to 2200 chars. First 125 chars must hook. Storytelling format. 15-20 hashtags.",
  instagram_reels:
    "Keep under 150 chars. Very punchy. 5-8 hashtags. Include emoji.",
  instagram_story:
    "Short overlay text, under 100 chars, casual tone, 2-3 hashtags.",
  youtube_shorts:
    "First 100 chars become the title. Descriptive but exciting. 3 hashtags max.",
  twitter:
    "Under 280 chars total including hashtags. Sharp and punchy. 2-3 hashtags.",
  pinterest:
    "Description-focused, 500 chars, SEO keywords, no hashtags, link-click oriented.",
  linkedin:
    "Professional tone, insight-driven, 1300 chars, 3-5 hashtags, thought leadership angle.",
  threads:
    "Conversational, under 500 chars, 2-3 hashtags, discussion-starting question at end.",
} as const;

type CaptionPlatform = keyof typeof platformRules;

const platformSchema = z.enum([
  "tiktok",
  "instagram_feed",
  "instagram_reels",
  "instagram_story",
  "youtube_shorts",
  "twitter",
  "linkedin",
  "pinterest",
  "threads",
] satisfies [CaptionPlatform, ...CaptionPlatform[]]);

const CAPTION_MODEL = "anthropic/claude-sonnet-4-5";

function parseJsonFromModel<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(jsonStr) as T;
}

export const generateCaptionTool = createTool({
  id: "generate-caption",
  description:
    "Generates platform-optimized captions and hashtags for a content piece",
  inputSchema: z.object({
    topic: z.string(),
    niche: z.string(),
    platform: platformSchema,
    contentType: z.enum([
      "poster",
      "video_short",
      "video_reel",
      "carousel",
    ]),
    affiliateLinkPlaceholder: z.boolean().default(true),
    brandVoice: z
      .enum([
        "authoritative",
        "casual",
        "inspirational",
        "educational",
        "entertaining",
      ])
      .default("entertaining"),
  }),
  outputSchema: z.object({
    caption: z.string(),
    hashtags: z.array(z.string()),
    callToAction: z.string(),
    fullPost: z.string(),
  }),
  execute: async (input) => {
    const platform = input.platform as CaptionPlatform;
    const rules = platformRules[platform];
    const { text } = await generateText({
      model: CAPTION_MODEL,
      prompt: `Generate a ${input.platform} caption for this content:
Topic: ${input.topic}
Niche: ${input.niche}
Content type: ${input.contentType}
Brand voice: ${input.brandVoice}
${input.affiliateLinkPlaceholder ? "Include [LINK] placeholder where the affiliate link should go." : ""}

Platform rules: ${rules}

Return JSON only:
{
  "caption": "the main caption text",
  "hashtags": ["tag1", "tag2"],
  "callToAction": "the CTA text",
  "fullPost": "caption + hashtags formatted for posting"
}`,
    });

    return parseJsonFromModel<{
      caption: string;
      hashtags: string[];
      callToAction: string;
      fullPost: string;
    }>(text);
  },
});

export const generateHashtagSetTool = createTool({
  id: "generate-hashtag-set",
  description:
    "Generates an optimized hashtag set mixing high/medium/low competition tags",
  inputSchema: z.object({
    niche: z.string(),
    topic: z.string(),
    platform: z.string(),
    count: z.number().default(20),
  }),
  outputSchema: z.object({
    highCompetition: z.array(z.string()),
    mediumCompetition: z.array(z.string()),
    lowCompetition: z.array(z.string()),
    recommended: z.array(z.string()),
  }),
  execute: async (input) => {
    const { text } = await generateText({
      model: CAPTION_MODEL,
      prompt: `Generate ${input.count} hashtags for ${input.platform} in the ${input.niche} niche about "${input.topic}".
Mix: 20% high competition (1M+ posts), 50% medium (100K-1M), 30% low (under 100K).
Return JSON only: { "highCompetition": [], "mediumCompetition": [], "lowCompetition": [], "recommended": [top 10 mix] }`,
    });

    return parseJsonFromModel<{
      highCompetition: string[];
      mediumCompetition: string[];
      lowCompetition: string[];
      recommended: string[];
    }>(text);
  },
});
