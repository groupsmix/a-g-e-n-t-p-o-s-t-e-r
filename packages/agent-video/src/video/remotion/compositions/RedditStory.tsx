import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { BACKGROUND_GRADIENTS, VERTICAL_TEXT } from "../shared.js";

export interface RedditStoryProps {
  title: string;
  body: string;
  subreddit: string;
}

export const RedditStory: React.FC<RedditStoryProps> = ({
  title,
  body,
  subreddit,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        background: BACKGROUND_GRADIENTS.light_minimal,
        padding: 60,
        justifyContent: "center",
      }}
    >
      <div
        style={{
          opacity,
          background: "#fff",
          borderRadius: 16,
          padding: 40,
          boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
        <p style={{ color: "#ff4500", fontSize: 28, fontWeight: 700 }}>
          r/{subreddit}
        </p>
        <h1
          style={{
            color: "#1a1a1a",
            fontSize: 42,
            fontFamily: "system-ui",
            margin: "16px 0",
          }}
        >
          {title}
        </h1>
        <p style={{ color: "#333", fontSize: 32, lineHeight: 1.4 }}>{body}</p>
      </div>
    </AbsoluteFill>
  );
};
