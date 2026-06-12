export interface PosterPromptConfig {
  topic: string;
  niche: string;
  style:
    | "modern_flat"
    | "dark_luxury"
    | "bright_viral"
    | "minimalist"
    | "bold_typographic"
    | "photo_realistic";
  aspectRatio: "1:1" | "9:16" | "16:9" | "4:5";
  colorScheme?: string;
  hasText?: boolean;
  brandName?: string;
}

const stylePrompts: Record<PosterPromptConfig["style"], string> = {
  modern_flat:
    "flat design, clean geometric shapes, modern illustration, bold colors, minimal",
  dark_luxury:
    "dark background, gold accents, luxury aesthetic, premium feel, high contrast",
  bright_viral:
    "bright vivid colors, eye-catching, high saturation, dynamic composition, social media ready",
  minimalist:
    "white background, minimal elements, lots of whitespace, elegant typography, simple",
  bold_typographic:
    "typography-focused, bold text layout, graphic design, editorial",
  photo_realistic:
    "photorealistic, high detail, professional photography, studio lighting, 8K quality",
};

const aspectDimensions: Record<
  PosterPromptConfig["aspectRatio"],
  { width: number; height: number }
> = {
  "1:1": { width: 1024, height: 1024 },
  "9:16": { width: 768, height: 1344 },
  "16:9": { width: 1344, height: 768 },
  "4:5": { width: 896, height: 1120 },
};

export function buildPosterPrompt(config: PosterPromptConfig): {
  prompt: string;
  negativePrompt: string;
  width: number;
  height: number;
} {
  const styleDesc = stylePrompts[config.style];
  const noTextInstruction = config.hasText
    ? ""
    : ", no text, no words, no letters";
  const colorHint = config.colorScheme
    ? `, color palette ${config.colorScheme}`
    : "";

  const prompt = `${config.niche} content about "${config.topic}", ${styleDesc}${colorHint}${noTextInstruction}, professional quality, trending on social media`;

  const negativePrompt =
    "blurry, low quality, watermark, ugly, distorted, amateur, pixelated, overexposed, underexposed";

  const { width, height } = aspectDimensions[config.aspectRatio];

  return { prompt, negativePrompt, width, height };
}
