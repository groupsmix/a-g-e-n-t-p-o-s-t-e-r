import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BACKGROUND_GRADIENTS, VERTICAL_TEXT } from "../shared.js";

export interface ScriptLine {
  text: string;
  startFrame: number;
  durationFrames: number;
  style?: "headline" | "subtitle" | "caption";
}

export interface ShortVideoProps {
  topic: string;
  script: ScriptLine[];
  backgroundStyle:
    | "dark_gradient"
    | "light_minimal"
    | "fire"
    | "nature"
    | "city";
  backgroundImageUrl?: string;
  voiceoverAudioUrl?: string;
  musicUrl?: string;
  niche: string;
}

export const ShortVideoComposition: React.FC<ShortVideoProps> = ({
  script,
  backgroundStyle,
  backgroundImageUrl,
  voiceoverAudioUrl,
  musicUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ background: BACKGROUND_GRADIENTS[backgroundStyle] }}>
      {backgroundImageUrl ? (
        <AbsoluteFill>
          <Img
            src={backgroundImageUrl}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              opacity: 0.4,
            }}
          />
        </AbsoluteFill>
      ) : null}

      {voiceoverAudioUrl ? <Audio src={voiceoverAudioUrl} /> : null}
      {musicUrl ? <Audio src={musicUrl} volume={0.15} /> : null}

      {script.map((line, i) => {
        const localFrame = frame - line.startFrame;
        const opacity = interpolate(
          localFrame,
          [0, 8, line.durationFrames - 8, line.durationFrames],
          [0, 1, 1, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
        );
        const scale = spring({
          frame: localFrame,
          fps,
          config: { damping: 12, stiffness: 200 },
        });

        return (
          <Sequence
            key={i}
            from={line.startFrame}
            durationInFrames={line.durationFrames}
          >
            <AbsoluteFill
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "60px 40px",
              }}
            >
              <p
                style={{
                  ...VERTICAL_TEXT,
                  fontSize:
                    line.style === "headline"
                      ? 72
                      : line.style === "subtitle"
                        ? 52
                        : 40,
                  fontWeight: line.style === "caption" ? 400 : 700,
                  opacity,
                  transform: `scale(${scale})`,
                }}
              >
                {line.text}
              </p>
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
