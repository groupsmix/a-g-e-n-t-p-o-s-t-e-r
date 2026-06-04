import "dotenv/config";
import { validateEnv } from "@repo/config";
import { generateSite } from "@repo/factory";

validateEnv();

async function main(): Promise<void> {
  const niche = process.env.NICHE;
  const affiliateTag = process.env.AFFILIATE_TAG;
  const primaryKeyword = process.env.PRIMARY_KEYWORD;

  if (!niche || !affiliateTag || !primaryKeyword) {
    console.error("Required env: NICHE, AFFILIATE_TAG, PRIMARY_KEYWORD");
    process.exit(1);
  }

  const affiliateProgram = (process.env.AFFILIATE_PROGRAM ??
    "amazon") as "amazon" | "impact" | "shareasale" | "gumroad";

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

  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("Site generation failed:", err);
  process.exit(1);
});
