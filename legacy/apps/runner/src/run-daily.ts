import "dotenv/config";
import { validateEnv } from "@repo/config";
import { getMastra } from "@repo/agents";
import { dailyRunWorkflow } from "@repo/workflows";

validateEnv();

async function main(): Promise<void> {
  console.log(`Starting daily run at ${new Date().toISOString()}`);

  const targetNiches =
    process.env.TARGET_NICHES?.split(",").filter(Boolean) ?? [];
  const isDryRun = process.env.DRY_RUN === "true";

  console.log(
    `  Target niches: ${targetNiches.length > 0 ? targetNiches.join(", ") : "all"}`,
  );
  console.log(`  Dry run: ${isDryRun}`);

  getMastra();
  const run = await dailyRunWorkflow.createRun();
  const result = await run.start({ inputData: {} });

  const output =
    result.status === "success" && result.result
      ? result.result
      : { postsPublished: 0, revenueToday: 0 };

  console.log("Daily run complete:");
  console.log(`  Posts published: ${output.postsPublished ?? 0}`);
  console.log(
    `  Revenue today: $${((output.revenueToday ?? 0) / 100).toFixed(2)}`,
  );

  if (result.status === "failed") {
    throw new Error(result.error?.message ?? "Daily workflow failed");
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Daily run failed:", err);
  process.exit(1);
});
