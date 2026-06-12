/** Cosmic object type slugs for posteragent sites. */
export const OBJECT_TYPES = {
  BLOG_POST: "blog-posts",
  PRODUCT_REVIEW: "product-reviews",
  LANDING_PAGE: "landing-pages",
  COMPARISON_PAGE: "comparisons",
  AFFILIATE_PRODUCT: "affiliate-products",
  SITE_CONFIG: "site-config",
  VIDEO_ASSET: "video-assets",
  POSTER_ASSET: "poster-assets",
} as const;

export type ObjectTypeSlug = (typeof OBJECT_TYPES)[keyof typeof OBJECT_TYPES];

export interface BlogPostMetadata {
  niche: string;
  keywords: string[];
  seoTitle: string;
  seoDescription: string;
  affiliateLinks: Array<{ text: string; url: string; product: string }>;
  publishStatus: "draft" | "published";
  targetSiteId: string;
}

export interface ProductReviewMetadata {
  productName: string;
  productUrl: string;
  affiliateUrl: string;
  price: string;
  rating: number;
  pros: string[];
  cons: string[];
  verdict: string;
  niche: string;
  keywords: string[];
}

export interface LandingPageMetadata {
  niche: string;
  headline: string;
  subheadline: string;
  ctaText: string;
  ctaUrl: string;
  publishStatus: "draft" | "published";
  targetSiteId: string;
}

export interface ComparisonPageMetadata {
  niche: string;
  products: Array<{ name: string; url: string; rating: number }>;
  winner: string;
  keywords: string[];
  publishStatus: "draft" | "published";
  targetSiteId: string;
}

export interface AffiliateProductMetadata {
  name: string;
  affiliateUrl: string;
  imageUrl?: string;
  price: string;
  niche: string;
}

export interface SiteConfigMetadata {
  siteName: string;
  domain: string;
  niche: string;
  primaryColor?: string;
  logoUrl?: string;
}

export interface VideoAssetMetadata {
  contentQueueId?: string;
  niche: string;
  compositionId?: string;
  durationSeconds?: number;
  voiceoverCdnUrl?: string;
  backgroundImageUrl?: string;
}

export interface PosterAssetMetadata {
  contentQueueId?: string;
  niche: string;
  style?: string;
  aspectRatio?: string;
}

export type CosmicObjectMetadata =
  | BlogPostMetadata
  | ProductReviewMetadata
  | LandingPageMetadata
  | ComparisonPageMetadata
  | AffiliateProductMetadata
  | SiteConfigMetadata
  | VideoAssetMetadata
  | PosterAssetMetadata;
