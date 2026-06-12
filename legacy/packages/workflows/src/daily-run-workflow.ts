import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getSupabase } from "@repo/core";
import { videoGenerationWorkflow } from "./video-generation-workflow.js";
import { publishingWorkflow } from "./publishing-workflow.js";

export const NICHES_CONFIG = [
  {
    niche: "personal finance",
    subreddits: ["personalfinance", "financialindependence"],
    tiktokHashtags: ["moneytips", "financetiktok"],
  },
  {
    niche: "productivity",
    subreddits: ["productivity", "getdisciplined"],
    tiktokHashtags: ["productivity", "lifehacks"],
  },
  {
    niche: "fitness",
    subreddits: ["fitness", "bodyweightfitness"],
    tiktokHashtags: ["fitness", "workouttips"],
  },
] as const;

export const DAILY_TARGETS = {
  postersPerNiche: 3,
  shortVideosPerNiche: 2,
  blogPostsPerSite: 2,
} as const;

const trendEntrySchema = z.object({
  niche: z.string(),
  trends: z.string(),
});

const trendsOutputSchema = z.object({
  allTrends: z.array(trendEntrySchema),
});

const queueFilledSchema = trendsOutputSchema.extend({
  queueFilled: z.boolean(),
});

const generationResultSchema = z.object({
  id: z.string(),
  success: z.boolean(),
  error: z.string().optional(),
});

const generationOutputSchema = queueFilledSchema.extend({
  generationResults: z.array(generationResultSchema),
});

const publishOutputSchema = generationOutputSchema.extend({
  publishResults: z.array(z.record(z.string(), z.unknown())),
});

const siteContentOutputSchema = publishOutputSchema.extend({
  siteContentGenerated: z.boolean(),
});

const dailyOutputSchema = z.object({
  postsPublished: z.number(),
  revenueToday: z.number(),
});

type NicheConfig = (typeof NICHES_CONFIG)[number];

function filterNiches(niches: readonly NicheConfig[]): NicheConfig[] {
  const target = process.env.TARGET_NICHES?.split(",")
    .map((n) => n.trim().toLowerCase())
    .filter(Boolean);
  if (!target?.length) return [...niches];
  return niches.filter((c) =>
    target.some((t) => c.niche.toLowerCase().includes(t)),
  );
}

const fetchAllTrendsStep = createStep({
  id: "fetch-all-trends",
  inputSchema: z.object({}),
  outputSchema: trendsOutputSchema,
  execute: async ({ mastra }) => {
    if (!mastra) throw new Error("Mastra instance required");

    const trendAgent = mastra.getAgent("trend-research-agent");
    const allTrends: z.infer<typeof trendsOutputSchema>["allTrends"] = [];

    for (const nicheConfig of filterNiches(NICHES_CONFIG)) {
      const result = await trendAgent.generate(
        `Find top 10 trends for the ${nicheConfig.niche} niche. Check subreddits: ${nicheConfig.subreddits.join(", ")} and TikTok hashtags: ${nicheConfig.tiktokHashtags.join(", ")}.`,
      );
      allTrends.push({
        niche: nicheConfig.niche,
        trends: typeof result.text === "string" ? result.text : String(result),
      });
    }

    return { allTrends };
  },
});

const fillQueueStep = createStep({
  id: "fill-queue",
  inputSchema: trendsOutputSchema,
  outputSchema: queueFilledSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error("Missing step input");
    if (!mastra) throw new Error("Mastra instance required");

    const queueAgent = mastra.getAgent("content-queue-manager");

    for (const trendData of inputData.allTrends) {
      await queueAgent.generate(
        `Queue ${DAILY_TARGETS.postersPerNiche} posters and ${DAILY_TARGETS.shortVideosPerNiche} short videos for the ${trendData.niche} niche based on these trends: ${trendData.trends}. Spread them across today.`,
      );
    }

    // Audit #17: queueFilled used to be hardcoded `true` even when the agent
    // inserted nothing, so downstream steps "generated content" for an empty
    // queue. Report what is actually in the queue.
    const { count } = await getSupabase()
      .from("content_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    return { ...inputData, queueFilled: (count ?? 0) > 0 };
  },
});

const generateAllContentStep = createStep({
  id: "generate-all-content",
  inputSchema: queueFilledSchema,
  outputSchema: generationOutputSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error("Missing step input");
    if (!mastra) throw new Error("Mastra instance required");

    // Audit #16 + T-38: claim the batch atomically with run_id/batch_id/
    // claim_token tracking. Two overlapping runs used to both read the same
    // `pending` rows and double-generate. The conditional UPDATE
    // (`status = 'pending'` in the WHERE) means each row is claimed by
    // exactly one run; rows another run grabbed first drop out.
    const runId = randomUUID();
    const batchId = randomUUID();

    const { data: candidates } = await getSupabase()
      .from("content_queue")
      .select("id")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .or("next_retry_at.is.null,next_retry_at.lte." + new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(50);

    const candidateIds = (candidates ?? []).map((c: { id: string }) => c.id);
    const { data: pendingItems } = candidateIds.length
      ? await getSupabase()
          .from("content_queue")
          .update({
            status: "generating",
            run_id: runId,
            batch_id: batchId,
            claim_token: randomUUID(),
            claimed_at: new Date().toISOString(),
            attempt_count: 1,
            last_error: null,
          })
          .in("id", candidateIds)
          .eq("status", "pending")
          .select("*")
      : { data: [] };

    const formatMap: Record<string, string> = {
      video_short: "did_you_know",
      video_reel: "story",
    };

    const results: z.infer<typeof generationResultSchema>[] = [];

    for (const item of pendingItems ?? []) {
      try {
        if (item.type === "poster") {
          const posterAgent = mastra.getAgent("poster-generation-agent");
          await posterAgent.generate(
            `Generate poster for queue item ${item.id}: topic "${item.topic}" in ${item.niche} niche`,
          );
        } else {
          const format =
            (formatMap[item.type] as
              | "did_you_know"
              | "how_to"
              | "vs_comparison"
              | "story"
              | "countdown"
              | "news_reaction"
              | "motivational") ?? "did_you_know";

          const run = await videoGenerationWorkflow.createRun();
          await run.start({
            inputData: {
              topic: item.topic,
              niche: item.niche,
              format,
              contentQueueId: item.id,
              ctaTarget: "link in bio",
              targetDurationSeconds: 30,
            },
          });
        }
        results.push({ id: item.id, success: true });
      } catch (error) {
        const message = String(error);
        results.push({ id: item.id, success: false, error: message });
        await getSupabase()
          .from("content_queue")
          .update({ status: "failed", error: message })
          .eq("id", item.id);
      }
    }

    return { ...inputData, generationResults: results };
  },
});

const publishAllReadyStep = createStep({
  id: "publish-all-ready",
  inputSchema: generationOutputSchema,
  outputSchema: publishOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error("Missing step input");

    const isDryRun = process.env.DRY_RUN === "true";
    const publishResults: Record<string, unknown>[] = [];

    if (isDryRun) {
      return { ...inputData, publishResults };
    }

    // Audit #16 + T-38: same atomic-claim pattern as generation — transition
    // ready → publishing with run_id/batch_id/claim_token so concurrent runs
    // can never double-publish the same queue item.
    const pubRunId = randomUUID();
    const pubBatchId = randomUUID();

    const { data: readyCandidates } = await getSupabase()
      .from("content_queue")
      .select("id")
      .eq("status", "ready")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true });

    const readyIds = (readyCandidates ?? []).map((c: { id: string }) => c.id);
    const { data: readyItems } = readyIds.length
      ? await getSupabase()
          .from("content_queue")
          .update({
            status: "publishing",
            run_id: pubRunId,
            batch_id: pubBatchId,
            claim_token: randomUUID(),
            claimed_at: new Date().toISOString(),
          })
          .in("id", readyIds)
          .eq("status", "ready")
          .select("id, scheduled_at")
      : { data: [] };

    for (const item of readyItems ?? []) {
      const run = await publishingWorkflow.createRun();
      const result = await run.start({
        inputData: { contentQueueId: item.id },
      });
      publishResults.push({
        contentQueueId: item.id,
        status: result.status,
      });
    }

    return { ...inputData, publishResults };
  },
});

const generateSiteContentStep = createStep({
  id: "generate-site-content",
  inputSchema: publishOutputSchema,
  outputSchema: siteContentOutputSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) throw new Error("Missing step input");
    if (!mastra) throw new Error("Mastra instance required");

    const { data: sites } = await getSupabase()
      .from("sites")
      .select("*")
      .eq("status", "live");

    const siteAgent = mastra.getAgent("site-content-agent");

    for (const site of sites ?? []) {
      await siteAgent.generate(
        `Generate ${DAILY_TARGETS.blogPostsPerSite} blog posts for the site in the ${site.niche} niche. Cosmic bucket: ${site.cosmic_bucket_slug}. Site id: ${site.id}. Affiliate program: ${site.affiliate_program}, tag: ${site.affiliate_tag}. Use generateBlogPost for each post with unique topics.`,
      );
    }

    return { ...inputData, siteContentGenerated: true };
  },
});

const dailyReportStep = createStep({
  id: "daily-report",
  inputSchema: siteContentOutputSchema,
  outputSchema: dailyOutputSchema,
  execute: async () => {
    // Audit #49: report boundaries used to be UTC midnight, which split
    // "yesterday evening" and "this morning" into the wrong day for anyone
    // not living on UTC. The day is now computed in REPORT_TIMEZONE
    // (IANA name, e.g. "Africa/Casablanca"), defaulting to UTC.
    const timeZone = process.env.REPORT_TIMEZONE || "UTC";
    // en-CA formats as YYYY-MM-DD, matching the previous string shape.
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    const { count: published } = await getSupabase()
      .from("published_posts")
      .select("*", { count: "exact", head: true })
      .gte("published_at", `${today}T00:00:00`);

    const { data: revenue } = await getSupabase()
      .from("revenue_events")
      .select("amount_cents")
      .eq("event_date", today);

    const totalRevenueCents =
      revenue?.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0) ?? 0;

    console.log("Daily run complete:");
    console.log(`  Posts published: ${published ?? 0}`);
    console.log(`  Revenue: $${(totalRevenueCents / 100).toFixed(2)}`);

    return {
      postsPublished: published ?? 0,
      revenueToday: totalRevenueCents,
    };
  },
});

export const dailyRunWorkflow = createWorkflow({
  id: "daily-run",
  inputSchema: z.object({}),
  outputSchema: dailyOutputSchema,
})
  .then(fetchAllTrendsStep)
  .then(fillQueueStep)
  .then(generateAllContentStep)
  .then(publishAllReadyStep)
  .then(generateSiteContentStep)
  .then(dailyReportStep)
  .commit();
