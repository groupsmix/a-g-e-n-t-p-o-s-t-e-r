import { getEnv } from "@repo/config";

export interface AmazonProductResult {
  asin: string;
  title: string;
  price: string;
  rating: number;
  affiliateUrl: string;
}

const nicheToCategoryMap: Record<string, string> = {
  finance: "Books",
  technology: "Electronics",
  health: "HealthPersonalCare",
  fitness: "SportingGoods",
  beauty: "Beauty",
  home: "HomeGarden",
  cooking: "GourmetFood",
  travel: "Luggage",
  education: "Books",
  gaming: "VideoGames",
};

/** Builds a tagged Amazon search URL (no PA-API required). */
export function buildAmazonSearchAffiliateUrl(keyword: string): string {
  const tag = getEnv().AMAZON_ASSOCIATE_TAG;
  const params = new URLSearchParams({
    k: keyword,
    tag,
  });
  return `https://www.amazon.com/s?${params.toString()}`;
}

export function buildAmazonProductAffiliateUrl(asin: string): string {
  const tag = getEnv().AMAZON_ASSOCIATE_TAG;
  return `https://www.amazon.com/dp/${asin}?tag=${tag}`;
}

/**
 * Resolves products for affiliate placeholders.
 * When PA-API credentials are configured later, this can call the official SDK.
 */
export async function searchAmazonProducts(
  keyword: string,
  niche: string,
): Promise<AmazonProductResult[]> {
  const category = nicheToCategoryMap[niche.toLowerCase()] ?? "All";
  void category;

  const affiliateUrl = buildAmazonSearchAffiliateUrl(keyword);
  return [
    {
      asin: "",
      title: keyword,
      price: "",
      rating: 0,
      affiliateUrl,
    },
  ];
}
