import "dotenv/config";
import { validateEnv } from "@repo/config";
import { getMastra } from "@repo/agents";

validateEnv();

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const nicheFlag = args.find((a) => a.startsWith("--niche="));
  const nicheFromFlag = nicheFlag?.split("=")[1];
  const nicheIdx = args.indexOf("--niche");
  const niche =
    nicheFromFlag ??
    (nicheIdx >= 0 ? args[nicheIdx + 1] : undefined) ??
    process.env.NICHE;

  if (!niche) {
    console.error("Usage: queue-niche -- --niche \"personal finance\"");
    process.exit(1);
  }

  const mastra = getMastra();
  const queueAgent = mastra.getAgent("content-queue-manager");

  await queueAgent.generate(
    `Queue 3 posters and 2 short videos for the ${niche} niche. Spread them across today.`,
  );

  console.log(`Queued initial batch for niche: ${niche}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Queue niche failed:", err);
  process.exit(1);
});
