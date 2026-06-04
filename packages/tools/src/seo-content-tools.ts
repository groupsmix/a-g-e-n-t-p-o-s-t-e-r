import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { generateText } from "ai";
import { createCosmicObject, OBJECT_TYPES } from "@repo/cms";
import { replaceAffiliateLinks } from "@repo/generators";

const SEO_MODEL = "anthropic/claude-sonnet-4-5";

function parseJsonFromModel<T>(text: string): T {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = fenced ? fenced[1].trim() : trimmed;
  return JSON.parse(jsonStr) as T;
}

export const generateBlogPostTool = createTool({
  id: "generate-blog-post",
  description: "Generates a full SEO-optimized blog post for a niche site",
  inputSchema: z.object({
    niche: z.string(),
    topic: z.string(),
    primaryKeyword: z.string(),
    secondaryKeywords: z.array(z.string()),
    targetWordCount: z.number().default(1500),
    affiliateProgram: z.string(),
    affiliateTag: z.string(),
    cosmicBucketSlug: z.string(),
    siteId: z.string(),
  }),
  outputSchema: z.object({
    title: z.string(),
    slug: z.string(),
    content: z.string(),
    seoTitle: z.string(),
    seoDescription: z.string(),
    cosmicObjectId: z.string(),
  }),
  execute: async (input) => {
    const targetWordCount = input.targetWordCount ?? 1500;
    const secondaryKeywords = input.secondaryKeywords ?? [];

    const { text } = await generateText({
      model: SEO_MODEL,
      prompt: `Write a ${targetWordCount}-word SEO blog post for the ${input.niche} niche.

Topic: "${input.topic}"
Primary keyword: "${input.primaryKeyword}"
Secondary keywords: ${secondaryKeywords.join(", ")}
Affiliate program: ${input.affiliateProgram}
Affiliate tag: ${input.affiliateTag}

Structure:
- H1 title (include primary keyword)
- Introduction (150 words, hook + primary keyword in first 100 chars)
- H2 sections (5-7 sections, include secondary keywords)
- Include 3-5 affiliate product mentions with [AFFILIATE_LINK: product name] placeholders
- FAQ section (5 questions)
- Conclusion with CTA

Write in a helpful, expert tone. Include specific numbers/facts. Internal linking: add [INTERNAL_LINK: related topic] placeholders.

Return JSON only:
{
  "title": "H1 title",
  "slug": "url-slug",
  "content": "full markdown content",
  "seoTitle": "60-char SEO title",
  "seoDescription": "160-char meta description with primary keyword"
}`,
    });

    const parsed = parseJsonFromModel<{
      title: string;
      slug: string;
      content: string;
      seoTitle: string;
      seoDescription: string;
    }>(text);

    const contentWithLinks = await replaceAffiliateLinks(
      parsed.content,
      input.niche,
      input.affiliateProgram,
    );

    const record = await createCosmicObject(
      {
        type: OBJECT_TYPES.BLOG_POST,
        title: parsed.title,
        slug: parsed.slug,
        content: contentWithLinks,
        status: "published",
        metadata: {
          seo_title: parsed.seoTitle,
          seo_description: parsed.seoDescription,
          niche: input.niche,
          primary_keyword: input.primaryKeyword,
          keywords: secondaryKeywords,
          publish_status: "published",
          target_site_id: input.siteId,
        },
      },
      { bucketSlug: input.cosmicBucketSlug },
    );

    return {
      ...parsed,
      content: contentWithLinks,
      cosmicObjectId: record.id,
    };
  },
});

export const generateProductReviewTool = createTool({
  id: "generate-product-review",
  description: "Generates a detailed affiliate product review page",
  inputSchema: z.object({
    productName: z.string(),
    productAsin: z.string().optional(),
    niche: z.string(),
    targetKeyword: z.string(),
    affiliateUrl: z.string(),
    cosmicBucketSlug: z.string(),
    siteId: z.string().optional(),
  }),
  outputSchema: z.object({
    title: z.string(),
    slug: z.string(),
    content: z.string(),
    rating: z.number(),
    cosmicObjectId: z.string(),
  }),
  execute: async (input) => {
    const { text } = await generateText({
      model: SEO_MODEL,
      prompt: `Write a comprehensive, honest product review for "${input.productName}" for the ${input.niche} niche.
Target keyword: "${input.targetKeyword}"
Affiliate URL: ${input.affiliateUrl}

Include:
- Summary box (rating 1-5, pros list, cons list, verdict)
- Detailed review sections
- Who it's for / who it's not for
- Comparison to 2 alternatives
- FAQ (5 questions)
- Clear CTA with affiliate link as [BUY_LINK]

Return JSON only: { "title": "", "slug": "", "content": "", "rating": 4.2 }`,
    });

    const parsed = parseJsonFromModel<{
      title: string;
      slug: string;
      content: string;
      rating: number;
    }>(text);

    let content = parsed.content.replace(
      /\[BUY_LINK\]/g,
      `[${input.productName}](${input.affiliateUrl})`,
    );
    content = await replaceAffiliateLinks(content, input.niche, "amazon");

    const record = await createCosmicObject(
      {
        type: OBJECT_TYPES.PRODUCT_REVIEW,
        title: parsed.title,
        slug: parsed.slug,
        content,
        status: "published",
        metadata: {
          product_name: input.productName,
          affiliate_url: input.affiliateUrl,
          rating: parsed.rating,
          niche: input.niche,
          keywords: [input.targetKeyword],
          target_site_id: input.siteId ?? "",
        },
      },
      { bucketSlug: input.cosmicBucketSlug },
    );

    return { ...parsed, content, cosmicObjectId: record.id };
  },
});
