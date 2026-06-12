import { AbsoluteFill, Img, interpolate, useCurrentFrame } from "remotion";
import { BACKGROUND_GRADIENTS, VERTICAL_TEXT } from "../shared.js";

export interface NewsBreakerProps {
  headline: string;
  summary: string;
  imageUrl: string;
}

export const NewsBreaker: React.FC<NewsBreakerProps> = ({
  headline,
  summary,
  imageUrl,
}) => {
  const frame = useCurrentFrame();
  const barWidth = interpolate(frame, [0, 30], [0, 100], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: "#111" }}>
      {imageUrl ? (
        <Img
          src={imageUrl}
          style={{ width: "100%", height: "55%", objectFit: "cover", opacity: 0.9 }}
        />
      ) : null}
      <AbsoluteFill
        style={{
          justifyContent: "flex-end",
          padding: 48,
          background: BACKGROUND_GRADIENTS.dark_gradient,
        }}
      >
        <div
          style={{
            height: 8,
            width: `${barWidth}%`,
            background: "#ef4444",
            marginBottom: 24,
          }}
        />
        <h1 style={{ ...VERTICAL_TEXT, fontSize: 52, textAlign: "left" }}>
          {headline}
        </h1>
        <p
          style={{
            ...VERTICAL_TEXT,
            fontSize: 32,
            textAlign: "left",
            marginTop: 20,
            opacity: 0.9,
          }}
        >
          {summary}
        </p>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
