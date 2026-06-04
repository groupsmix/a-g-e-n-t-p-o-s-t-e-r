import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
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
  const opacity = interpolate(frame, [0, 20, 120, 150], [0, 1, 1, 0], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background: BACKGROUND_GRADIENTS[background] ?? BACKGROUND_GRADIENTS.dark_luxury,
        justifyContent: "center",
        alignItems: "center",
        padding: 80,
      }}
    >
      <div style={{ opacity, textAlign: "center" }}>
        <p style={{ ...VERTICAL_TEXT, fontSize: 64, fontWeight: 700 }}>{quote}</p>
        {author ? (
          <p style={{ ...VERTICAL_TEXT, fontSize: 36, marginTop: 40, opacity: 0.85 }}>
            — {author}
          </p>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
