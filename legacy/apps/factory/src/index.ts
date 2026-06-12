import { generateSite, type SiteConfig } from "./site-generator.js";

export {
  generateSite,
  type SiteConfig,
  type GenerateSiteResult,
} from "./site-generator.js";

// `runFactory()` removed (AUDIT-PR20 dead-code) — never called.
// `runFactoryWithConfig` below is the real entry point used by the
// `pnpm --filter @repo/factory run generate` script and external
// importers.

export async function runFactoryWithConfig(config: SiteConfig): Promise<void> {
  const result = await generateSite(config);
  console.log(JSON.stringify(result, null, 2));
}
