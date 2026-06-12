import { validateEnv } from "@repo/config";
import { generateSite } from "./site-generator.js";

validateEnv();

async function main(): Promise<void> {
  const niche = process.env.NICHE;
  const affiliateTag = process.env.AFFILIATE_TAG;
  const primaryKeyword = process.env.PRIMARY_KEYWORD;

  if (!niche || !affiliateTag || !primaryKeyword) {
    console.error(
      "Required env: NICHE, AFFILIATE_TAG, PRIMARY_KEYWORD (optional: AFFILIATE_PROGRAM)",
    );
    process.exit(1);
  }

  const affiliateProgram = (process.env.AFFILIATE_PROGRAM ??
    "amazon") as "amazon" | "impact" | "shareasale" | "gumroad";

  console.log(`Generating site for niche: ${niche}`);

  const result = await generateSite({
    niche,
    affiliateProgram,
    affiliateTag,
    primaryKeyword,
    targetCountry: process.env.TARGET_COUNTRY ?? "US",
    colorScheme: {
      primary: "#2563eb",
      secondary: "#1e40af",
      accent: "#f59e0b",
    },
    monetizationTypes: ["affiliate_links"],
  });

  console.log("Site created:");
  console.log(`  siteId: ${result.siteId}`);
  console.log(`  url: ${result.vercelUrl}`);
  console.log(`  cosmic: ${result.cosmicBucketSlug}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
