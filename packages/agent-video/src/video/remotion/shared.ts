import type { CSSProperties } from "react";
import { loadFont } from "@remotion/google-fonts/Outfit";

// Dynamically load the Outfit font from Google Fonts for a premium look
const { fontFamily } = loadFont();

export const BACKGROUND_GRADIENTS: Record<string, string> = {
  dark_gradient:
    "linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%)",
  light_minimal: "linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)",
  fire: "linear-gradient(135deg, #f12711 0%, #f5af19 100%)",
  nature: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)",
  city: "linear-gradient(135deg, #141E30 0%, #243B55 100%)",
  dark_luxury: "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #2d2d44 100%)",
};

export const VERTICAL_TEXT: CSSProperties = {
  color: "#ffffff",
  textAlign: "center",
  fontFamily,
  textShadow: "0 4px 30px rgba(0,0,0,0.85)",
  maxWidth: "920px",
  lineHeight: 1.35,
  letterSpacing: "-0.02em",
};
