import { AbsoluteFill, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { BACKGROUND_GRADIENTS, VERTICAL_TEXT } from "../shared.js";

export interface CountdownListProps {
  title: string;
  items: string[];
}

export const CountdownList: React.FC<CountdownListProps> = ({ title, items }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const framesPerItem = Math.floor(300 / Math.max(items.length, 1));

  return (
    <AbsoluteFill
      style={{
        background: BACKGROUND_GRADIENTS.dark_gradient,
        padding: 80,
        justifyContent: "center",
      }}
    >
      <h1 style={{ ...VERTICAL_TEXT, fontSize: 56, marginBottom: 48 }}>{title}</h1>
      {items.map((item, i) => {
        const start = 30 + i * framesPerItem;
        const scale = spring({
          frame: frame - start,
          fps,
          config: { damping: 14, stiffness: 180 },
        });
        if (frame < start) return null;
        return (
          <Sequence key={i} from={start} durationInFrames={framesPerItem}>
            <p
              style={{
                ...VERTICAL_TEXT,
                fontSize: 44,
                textAlign: "left",
                transform: `scale(${scale})`,
                marginBottom: 24,
              }}
            >
              {items.length - i}. {item}
            </p>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
