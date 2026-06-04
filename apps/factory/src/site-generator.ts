import { execSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { getEnv } from "@repo/config";
import { getSupabase } from "@repo/core";

export interface SiteConfig {
  niche: string;
  domain?: string;
  affiliateProgram: "amazon" | "impact" | "shareasale" | "gumroad";
  affiliateTag: string;
  primaryKeyword: string;
  targetCountry: string;
  colorScheme: {
    primary: string;
    secondary: string;
    accent: string;
  };
  monetizationTypes: (
    | "affiliate_links"
    | "adsense"
    | "email_list"
    | "digital_products"
  )[];
}

export interface GenerateSiteResult {
  siteId: string;
  vercelUrl: string;
  cosmicBucketSlug: string;
}

const BOILERPLATE_REPO =
  "https://github.com/cosmicjs/cosmicjs-node-website-boilerplate";

export async function generateSite(
  config: SiteConfig,
): Promise<GenerateSiteResult> {
  const env = getEnv();
  const siteSlug = config.niche
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
  const projectName = `site-${siteSlug}-${Date.now()}`;
  const tempDir = path.join(os.tmpdir(), projectName);

  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  execSync(`git clone --depth 1 ${BOILERPLATE_REPO} "${tempDir}"`, {
    stdio: "inherit",
  });

  const { cosmicBucketSlug } = await createCosmicBucket(siteSlug, config);
  await configureProject(tempDir, config, cosmicBucketSlug);

  const vercelUrl = await deployToVercel(
    tempDir,
    projectName,
    cosmicBucketSlug,
    config,
  );

  const { data, error } = await getSupabase()
    .from("sites")
    .insert({
      niche: config.niche,
      domain: config.domain ?? null,
      vercel_project_id: projectName,
      cosmic_bucket_slug: cosmicBucketSlug,
      status: "live",
      affiliate_program: config.affiliateProgram,
      affiliate_tag: config.affiliateTag,
      deployed_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to save site: ${error?.message ?? "no data"}`);
  }

  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Non-fatal cleanup
  }

  return {
    siteId: data.id,
    vercelUrl,
    cosmicBucketSlug,
  };
}

async function createCosmicBucket(
  slug: string,
  config: SiteConfig,
): Promise<{ cosmicBucketSlug: string }> {
  const env = getEnv();
  const response = await fetch("https://api.cosmicjs.com/v3/buckets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.COSMIC_WRITE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: config.niche,
      slug: `${slug}-${Date.now()}`,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Cosmic bucket creation failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    bucket?: { slug?: string };
  };
  const cosmicBucketSlug = data.bucket?.slug;
  if (!cosmicBucketSlug) {
    throw new Error("Cosmic API did not return bucket slug");
  }

  return { cosmicBucketSlug };
}

async function configureProject(
  dir: string,
  config: SiteConfig,
  cosmicBucketSlug: string,
): Promise<void> {
  const env = getEnv();
  const envContent = [
    `COSMIC_BUCKET_SLUG=${cosmicBucketSlug}`,
    `COSMIC_READ_KEY=${env.COSMIC_READ_KEY}`,
    `COSMIC_WRITE_KEY=${env.COSMIC_WRITE_KEY}`,
    `NEXT_PUBLIC_AFFILIATE_TAG=${config.affiliateTag}`,
    `NEXT_PUBLIC_AFFILIATE_PROGRAM=${config.affiliateProgram}`,
    `NEXT_PUBLIC_NICHE=${config.niche}`,
    `NEXT_PUBLIC_GA_ID=${env.GOOGLE_ANALYTICS_ID ?? ""}`,
  ].join("\n");

  fs.writeFileSync(path.join(dir, ".env.local"), envContent);

  const pkgPath = path.join(dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as {
    name?: string;
  };
  pkg.name = `site-${config.niche.toLowerCase().replace(/\s+/g, "-")}`;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

async function deployToVercel(
  dir: string,
  projectName: string,
  cosmicBucketSlug: string,
  config: SiteConfig,
): Promise<string> {
  const env = getEnv();

  try {
    const output = execSync(
      `npx vercel deploy --prod --yes --name ${projectName}`,
      {
        cwd: dir,
        encoding: "utf-8",
        env: {
          ...process.env,
          VERCEL_ORG_ID: env.VERCEL_ORG_ID,
          VERCEL_TOKEN: env.VERCEL_TOKEN,
          COSMIC_BUCKET_SLUG: cosmicBucketSlug,
          NEXT_PUBLIC_AFFILIATE_TAG: config.affiliateTag,
        },
      },
    );
    const url = output.trim().split("\n").pop()?.trim();
    if (url?.startsWith("http")) {
      return url;
    }
  } catch {
    // Fall through to REST deploy request
  }

  const response = await fetch("https://api.vercel.com/v13/deployments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: projectName,
      target: "production",
      env: [
        {
          key: "COSMIC_BUCKET_SLUG",
          value: cosmicBucketSlug,
          type: "plain",
        },
        {
          key: "NEXT_PUBLIC_AFFILIATE_TAG",
          value: config.affiliateTag,
          type: "plain",
        },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Vercel deploy failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { url?: string };
  if (!data.url) {
    throw new Error("Vercel API did not return deployment URL");
  }
  return data.url.startsWith("http") ? data.url : `https://${data.url}`;
}
