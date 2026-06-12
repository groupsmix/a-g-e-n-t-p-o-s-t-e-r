import { AbsoluteFill, Img, Sequence } from "remotion";
import { BACKGROUND_GRADIENTS, VERTICAL_TEXT } from "../shared.js";

export interface PosterSlideshowProps {
  images: string[];
  captions: string[];
}

export const PosterSlideshow: React.FC<PosterSlideshowProps> = ({
  images,
  captions,
}) => {
  const slideFrames = Math.floor(180 / Math.max(images.length, 1));

  return (
    <AbsoluteFill style={{ background: BACKGROUND_GRADIENTS.dark_gradient }}>
      {images.map((src, i) => (
        <Sequence key={i} from={i * slideFrames} durationInFrames={slideFrames}>
          <AbsoluteFill>
            <Img
              src={src}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            {captions[i] ? (
              <AbsoluteFill
                style={{
                  justifyContent: "flex-end",
                  padding: 60,
                  background:
                    "linear-gradient(transparent, rgba(0,0,0,0.75))",
                }}
              >
                <p style={{ ...VERTICAL_TEXT, fontSize: 48 }}>{captions[i]}</p>
              </AbsoluteFill>
            ) : null}
          </AbsoluteFill>
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
