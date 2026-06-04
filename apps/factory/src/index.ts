import { generateSite, type SiteConfig } from "./site-generator.js";

export {
  generateSite,
  type SiteConfig,
  type GenerateSiteResult,
} from "./site-generator.js";

/** Site generator entry — TASK 6.1 */
export async function runFactory(): Promise<void> {
  console.log("Factory — use `pnpm --filter @repo/factory run generate` or import generateSite()");
}

export async function runFactoryWithConfig(config: SiteConfig): Promise<void> {
  const result = await generateSite(config);
  console.log(JSON.stringify(result, null, 2));
}
