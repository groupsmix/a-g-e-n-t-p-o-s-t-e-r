export {
  uploadToCosmicCDN,
  generateAIVideo,
  type UploadResult,
  type AIVideoResult,
} from "./client.js";

export {
  OBJECT_TYPES,
  type ObjectTypeSlug,
  type BlogPostMetadata,
  type ProductReviewMetadata,
  type LandingPageMetadata,
  type ComparisonPageMetadata,
  type AffiliateProductMetadata,
  type SiteConfigMetadata,
  type VideoAssetMetadata,
  type PosterAssetMetadata,
  type CosmicObjectMetadata,
} from "./content-types.js";

export {
  createCosmicObject,
  getCosmicObject,
  findCosmicObjects,
  updateCosmicObject,
  deleteCosmicObject,
  type CosmicObjectInput,
  type CosmicObjectRecord,
} from "./objects.js";
