import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { BACKGROUND_GRADIENTS, VERTICAL_TEXT } from "../shared.js";

export interface PosterSlideshowProps {
  images: string[];
  captions: string[];
}

export const PosterSlideshow: React.FC<PosterSlideshowProps> = ({
  images,
  captions,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  const totalSlides = Math.max(images.length, 1);
  const slideFrames = Math.floor(durationInFrames / totalSlides);

  return (
    <AbsoluteFill style={{ background: BACKGROUND_GRADIENTS.dark_gradient }}>
      {images.map((src, i) => {
        const startFrame = i * slideFrames;
        
        return (
          <Sequence
            key={i}
            from={startFrame}
            durationInFrames={slideFrames}
          >
            <Slide
              src={src}
              caption={captions[i] || ""}
              slideFrames={slideFrames}
              fps={fps}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

// Internal component for an individual animated slide to isolate the frame scope
interface SlideProps {
  src: string;
  caption: string;
  slideFrames: number;
  fps: number;
}

const Slide: React.FC<SlideProps> = ({ src, caption, slideFrames, fps }) => {
  const frame = useCurrentFrame();

  // 1. Ken Burns Effect: continuous slow zoom
  const scale = interpolate(
    frame,
    [0, slideFrames],
    [1.0, 1.15],
    { extrapolateRight: "clamp" }
  );

  // Slight rotation to add dimension to the Ken Burns effect
  const rotate = interpolate(
    frame,
    [0, slideFrames],
    [0, 0.8],
    { extrapolateRight: "clamp" }
  );

  // 2. Slide transitions: fade-in at the start, fade-out at the end
  const transitionDuration = 12; // 12 frames transition
  const opacity = interpolate(
    frame,
    [0, transitionDuration, slideFrames - transitionDuration, slideFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  // 3. Caption entrance animation
  const captionSpring = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 100 },
    delay: 8,
  });

  const captionTranslateY = interpolate(captionSpring, [0, 1], [60, 0]);
  const captionOpacity = interpolate(captionSpring, [0, 1], [0, 1]);

  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden" }}>
      {/* Background backing in case images are portrait/landscape mismatch */}
      <AbsoluteFill style={{ background: "#000" }} />

      {/* The image with Ken Burns animation */}
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) rotate(${rotate}deg)`,
        }}
      />

      {/* Vignette overlay for visual depth and text readability */}
      <AbsoluteFill
        style={{
          boxShadow: "inset 0 0 100px rgba(0,0,0,0.8)",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, transparent 60%, rgba(0,0,0,0.7) 100%)",
        }}
      />

      {/* Caption container and text */}
      {caption ? (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 120,
            paddingLeft: 60,
            paddingRight: 60,
          }}
        >
          <div
            style={{
              transform: `translateY(${captionTranslateY}px)`,
              opacity: captionOpacity,
              background: "rgba(0, 0, 0, 0.55)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              padding: "30px 45px",
              borderRadius: "16px",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
              maxWidth: "960px",
            }}
          >
            <p
              style={{
                ...VERTICAL_TEXT,
                fontSize: 44,
                fontWeight: 600,
                lineHeight: 1.3,
                textShadow: "none", // drop textShadow since we have solid background box
              }}
            >
              {caption}
            </p>
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
