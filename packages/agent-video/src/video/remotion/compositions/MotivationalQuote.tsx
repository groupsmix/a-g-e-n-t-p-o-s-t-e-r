import React from "react";
import {
  AbsoluteFill,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BACKGROUND_GRADIENTS, VERTICAL_TEXT } from "../shared.js";

export interface MotivationalQuoteProps {
  quote: string;
  author: string;
  background: string;
}

export const MotivationalQuote: React.FC<MotivationalQuoteProps> = ({
  quote,
  author,
  background,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring animation for the quote text
  const quoteSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100 },
    delay: 5,
  });

  // Slide-in translation for the quote
  const quoteTranslateY = interpolate(quoteSpring, [0, 1], [40, 0]);
  const quoteOpacity = interpolate(quoteSpring, [0, 1], [0, 1]);

  // Entrance spring for the author name (slightly delayed)
  const authorSpring = spring({
    frame,
    fps,
    config: { damping: 12, stiffness: 90 },
    delay: 25,
  });

  const authorTranslateY = interpolate(authorSpring, [0, 1], [30, 0]);
  const authorOpacity = interpolate(authorSpring, [0, 1], [0, 0.85]);

  // Animated line width to create a drawing effect between quote and author
  const lineSpring = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 80 },
    delay: 15,
  });
  const lineWidthPercent = interpolate(lineSpring, [0, 1], [0, 150]);

  // Outro transition (fade out) at the end of the composition
  // This composition is 150 frames (5 seconds at 30fps)
  const outroOpacity = interpolate(
    frame,
    [130, 148],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        background: BACKGROUND_GRADIENTS[background] ?? BACKGROUND_GRADIENTS.dark_luxury,
        justifyContent: "center",
        alignItems: "center",
        padding: "80px 60px",
        opacity: outroOpacity,
      }}
    >
      {/* Decorative ambient blurred orb in the background */}
      <div
        style={{
          position: "absolute",
          width: "600px",
          height: "600px",
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(245, 175, 25, 0.1) 0%, rgba(0,0,0,0) 70%)",
          filter: "blur(60px)",
          top: "15%",
          left: "10%",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
        }}
      >
        {/* Animated Quotation Mark Icon */}
        <span
          style={{
            fontSize: "120px",
            fontFamily: "Georgia, serif",
            color: "rgba(245, 175, 25, 0.25)",
            lineHeight: 1,
            marginBottom: "-30px",
            transform: `scale(${quoteSpring})`,
            opacity: quoteOpacity,
          }}
        >
          “
        </span>

        {/* The main Quote text */}
        <p
          style={{
            ...VERTICAL_TEXT,
            fontSize: 68,
            fontWeight: 700,
            transform: `translateY(${quoteTranslateY}px)`,
            opacity: quoteOpacity,
            padding: "0 20px",
          }}
        >
          {quote}
        </p>

        {/* Drawing decorative separator line */}
        <div
          style={{
            height: "4px",
            width: `${lineWidthPercent}px`,
            background: "linear-gradient(90deg, transparent, #f5af19, transparent)",
            marginTop: 40,
            marginBottom: 30,
            borderRadius: "2px",
          }}
        />

        {/* Animated Author */}
        {author ? (
          <p
            style={{
              ...VERTICAL_TEXT,
              fontSize: 38,
              fontWeight: 500,
              color: "#f5af19",
              transform: `translateY(${authorTranslateY}px)`,
              opacity: authorOpacity,
            }}
          >
            — {author}
          </p>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
