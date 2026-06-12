export {
  generateImage,
  type ImageGenerationParams,
  type ImageModel,
} from "./image/replicate-client.js";

export {
  buildPosterPrompt,
  type PosterPromptConfig,
} from "./image/prompt-builder.js";

export {
  renderVideo,
  type RenderVideoParams,
  type RenderVideoResult,
  createTempVideoDir,
  cleanupTempVideoDir,
} from "./video/renderer.js";

export {
  generateVoiceover,
  type VoiceoverResult,
  generateSRTSubtitles,
  createTempAudioDir,
  cleanupTempAudioDir,
} from "./audio/voiceover.js";

export {
  searchAmazonProducts,
  buildAmazonSearchAffiliateUrl,
  buildAmazonProductAffiliateUrl,
  type AmazonProductResult,
} from "./affiliate/amazon.js";

export { replaceAffiliateLinks } from "./affiliate/link-replacer.js";
